#!/usr/bin/env bash
# Create the Alibaba Cloud infrastructure AmanSignal runs on, using the official CLI.
#
# Everything here is one small VM plus the networking it needs. That is deliberately
# not Terraform: a single instance with a two-week life does not earn a provider,
# state backend and import story. This script is idempotent, so re-running it after a
# failure converges rather than duplicating resources, which is the property that
# actually matters for recoverability.
#
# PREREQUISITES
#   1. An Alibaba Cloud account with ECS billing enabled.
#   2. A RAM user with AliyunECSFullAccess and AliyunVPCFullAccess, and an AccessKey
#      pair for it. Do not use the root account's AccessKey.
#   3. aliyun CLI installed, then:
#        aliyun configure --profile amansignal
#      (region ap-southeast-1, output json)
#
# USAGE
#   bash deploy/create-instance.sh
#   bash deploy/create-instance.sh --dry-run     # print what would be created
set -euo pipefail

PROFILE="${ALIYUN_PROFILE:-amansignal}"
REGION="${ALIYUN_REGION:-ap-southeast-1}"        # Singapore: same region as the model quota
NAME="${AMANSIGNAL_NAME:-amansignal}"
INSTANCE_TYPE="${AMANSIGNAL_INSTANCE_TYPE:-ecs.e-c1m2.large}"   # 2 vCPU / 4 GB, burstable
DISK_GB="${AMANSIGNAL_DISK_GB:-40}"
BANDWIDTH_MBPS="${AMANSIGNAL_BANDWIDTH:-5}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# --region sets the endpoint; RegionId is a separate required parameter on several
# of these APIs, and omitting it makes discovery calls return nothing rather than
# error, which reads as "no zones exist" instead of "you forgot a parameter".
ali() { aliyun --profile "$PROFILE" --region "$REGION" "$@"; }
ali_r() { aliyun --profile "$PROFILE" --region "$REGION" "$@" --RegionId "$REGION"; }

command -v aliyun >/dev/null || { echo "aliyun CLI not found. Install it first." >&2; exit 1; }
if ! ali ecs DescribeRegions >/dev/null 2>&1; then
  echo "Cannot authenticate. Run: aliyun configure --profile $PROFILE" >&2
  exit 1
fi

echo "==> Region $REGION, profile $PROFILE"

# --- SSH key ------------------------------------------------------------------
# A key pair, never a password: a password-auth box on a public IP is found by
# scanners within minutes.
KEY_NAME="${NAME}-key"
KEY_FILE="${HOME}/.ssh/${KEY_NAME}.pem"
if ali ecs DescribeKeyPairs --KeyPairName "$KEY_NAME" | grep -q "$KEY_NAME"; then
  echo "==> Key pair $KEY_NAME already exists"
  [[ -f "$KEY_FILE" ]] || echo "    WARNING: $KEY_FILE is missing locally; you cannot SSH in without it."
else
  echo "==> Creating key pair $KEY_NAME"
  $DRY_RUN || {
    mkdir -p "$(dirname "$KEY_FILE")"
    ali ecs CreateKeyPair --KeyPairName "$KEY_NAME" \
      | python -c "import json,sys; print(json.load(sys.stdin)['PrivateKeyBody'])" > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    echo "    private key written to $KEY_FILE (not recoverable later)"
  }
fi

# --- Network ------------------------------------------------------------------
find_vpc() {
  ali vpc DescribeVpcs --VpcName "${NAME}-vpc" \
    | python -c "import json,sys; v=json.load(sys.stdin)['Vpcs']['Vpc']; print(v[0]['VpcId'] if v else '')"
}
VPC_ID="$(find_vpc || true)"
if [[ -z "$VPC_ID" ]]; then
  echo "==> Creating VPC"
  $DRY_RUN || ali vpc CreateVpc --VpcName "${NAME}-vpc" --CidrBlock 172.16.0.0/16 >/dev/null
  # Creation is asynchronous; the VPC is not queryable for a moment after the call.
  $DRY_RUN || for _ in $(seq 1 20); do VPC_ID="$(find_vpc || true)"; [[ -n "$VPC_ID" ]] && break; sleep 3; done
fi
echo "    VPC: ${VPC_ID:-<dry-run>}"

# Pick a zone that actually has capacity for this instance type. Availability
# varies per type per zone, so taking the region's first zone launches into a
# zone that may not offer it.
ZONE="$(ali_r ecs DescribeAvailableResource --DestinationResource InstanceType \
  --InstanceChargeType PostPaid 2>/dev/null \
  | python -c "
import json,sys
want='$INSTANCE_TYPE'
try:
  zones=json.load(sys.stdin)['AvailableZones']['AvailableZone']
except Exception:
  print(''); raise SystemExit
for z in zones:
    for r in z.get('AvailableResources',{}).get('AvailableResource',[]):
        for s in r.get('SupportedResources',{}).get('SupportedResource',[]):
            if s.get('Value')==want and s.get('Status')=='Available':
                print(z['ZoneId']); raise SystemExit
print('')" || true)"
if [[ -z "$ZONE" ]]; then
  echo "    No zone in $REGION has capacity for $INSTANCE_TYPE." >&2
  echo "    Set AMANSIGNAL_INSTANCE_TYPE to an available type and re-run." >&2
  exit 1
fi
echo "    Zone: $ZONE (has capacity for $INSTANCE_TYPE)"

find_vsw() {
  ali vpc DescribeVSwitches --VpcId "$VPC_ID" --VSwitchName "${NAME}-vsw" \
    | python -c "import json,sys; v=json.load(sys.stdin)['VSwitches']['VSwitch']; print(v[0]['VSwitchId'] if v else '')"
}
if [[ -n "${VPC_ID:-}" ]]; then
  VSW_ID="$(find_vsw || true)"
  if [[ -z "$VSW_ID" ]]; then
    echo "==> Creating vSwitch"
    $DRY_RUN || ali vpc CreateVSwitch --VpcId "$VPC_ID" --ZoneId "$ZONE" \
      --CidrBlock 172.16.1.0/24 --VSwitchName "${NAME}-vsw" >/dev/null
    $DRY_RUN || for _ in $(seq 1 20); do VSW_ID="$(find_vsw || true)"; [[ -n "$VSW_ID" ]] && break; sleep 3; done
  fi
  echo "    vSwitch: ${VSW_ID:-<dry-run>}"
fi

# --- Security group -----------------------------------------------------------
find_sg() {
  ali ecs DescribeSecurityGroups --VpcId "$VPC_ID" --SecurityGroupName "${NAME}-sg" \
    | python -c "import json,sys; g=json.load(sys.stdin)['SecurityGroups']['SecurityGroup']; print(g[0]['SecurityGroupId'] if g else '')"
}
if [[ -n "${VPC_ID:-}" ]]; then
  SG_ID="$(find_sg || true)"
  if [[ -z "$SG_ID" ]]; then
    echo "==> Creating security group"
    $DRY_RUN || ali ecs CreateSecurityGroup --VpcId "$VPC_ID" --SecurityGroupName "${NAME}-sg" \
      --Description "AmanSignal web + restricted SSH" >/dev/null
    $DRY_RUN || for _ in $(seq 1 20); do SG_ID="$(find_sg || true)"; [[ -n "$SG_ID" ]] && break; sleep 3; done
  fi
  echo "    Security group: ${SG_ID:-<dry-run>}"

  # 80 and 443 are public because the product is public. SSH is restricted to the
  # operator's current address; leaving 22 open to 0.0.0.0/0 is the single most
  # common way a demo box gets compromised.
  MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org || echo "")"
  if [[ -z "$MY_IP" ]]; then
    echo "    WARNING: could not determine your public IP; skipping the SSH rule." >&2
    echo "             Add it by hand before trying to connect." >&2
  fi
  if [[ -n "${SG_ID:-}" ]] && ! $DRY_RUN; then
    for spec in "80/80:0.0.0.0/0" "443/443:0.0.0.0/0" ${MY_IP:+"22/22:${MY_IP}/32"}; do
      ports="${spec%%:*}"; cidr="${spec##*:}"
      ali ecs AuthorizeSecurityGroup --SecurityGroupId "$SG_ID" --IpProtocol tcp \
        --PortRange "$ports" --SourceCidrIp "$cidr" --Priority 1 >/dev/null 2>&1 || true
      echo "    allow tcp $ports from $cidr"
    done
  fi
fi

# --- Image --------------------------------------------------------------------
# Plain x64 server images only. The GPU/CUDA and arm64 builds share the ubuntu
# prefix and would otherwise be selected; neither runs this workload.
IMAGE_ID="$(ali_r ecs DescribeImages --OSType linux --ImageOwnerAlias system \
  --PageSize 100 2>/dev/null \
  | python -c "
import json,sys,re
try:
  imgs=[i['ImageId'] for i in json.load(sys.stdin)['Images']['Image']]
except Exception:
  print(''); raise SystemExit
ok=[i for i in imgs
    if re.match(r'ubuntu_(22|24)_', i) and 'x64' in i
    and 'gpu' not in i and 'cuda' not in i]
ok.sort(reverse=True)
print(ok[0] if ok else '')" || true)"
if [[ -z "$IMAGE_ID" ]]; then
  echo "    No suitable Ubuntu x64 image found in $REGION." >&2
  exit 1
fi
echo "    Image: $IMAGE_ID"

if $DRY_RUN; then
  echo
  echo "Dry run complete. Would launch $INSTANCE_TYPE with a ${DISK_GB}GB disk and ${BANDWIDTH_MBPS}Mbps public bandwidth."
  exit 0
fi

# --- Instance -----------------------------------------------------------------
EXISTING="$(ali ecs DescribeInstances --InstanceName "$NAME" \
  | python -c "import json,sys; i=json.load(sys.stdin)['Instances']['Instance']; print(i[0]['InstanceId'] if i else '')" || true)"

if [[ -n "$EXISTING" ]]; then
  echo "==> Instance $NAME already exists ($EXISTING)"
  INSTANCE_ID="$EXISTING"
else
  echo "==> Launching instance"
  # PostPaid (pay-as-you-go) so it can be released the day after the event.
  INSTANCE_ID="$(ali ecs RunInstances \
    --ImageId "$IMAGE_ID" \
    --InstanceType "$INSTANCE_TYPE" \
    --SecurityGroupId "$SG_ID" \
    --VSwitchId "$VSW_ID" \
    --InstanceName "$NAME" \
    --HostName "$NAME" \
    --KeyPairName "$KEY_NAME" \
    --InstanceChargeType PostPaid \
    --InternetChargeType PayByTraffic \
    --InternetMaxBandwidthOut "$BANDWIDTH_MBPS" \
    --SystemDisk.Category cloud_essd \
    --SystemDisk.Size "$DISK_GB" \
    --Amount 1 \
    | python -c "import json,sys; print(json.load(sys.stdin)['InstanceIdSets']['InstanceIdSet'][0])")"
  echo "    $INSTANCE_ID"
fi

echo "==> Waiting for a public IP"
PUBLIC_IP=""
for _ in $(seq 1 40); do
  PUBLIC_IP="$(ali ecs DescribeInstances --InstanceIds "[\"$INSTANCE_ID\"]" \
    | python -c "
import json,sys
i=json.load(sys.stdin)['Instances']['Instance']
if not i: print(''); raise SystemExit
ip=i[0].get('PublicIpAddress',{}).get('IpAddress',[])
print(ip[0] if ip else '')" || true)"
  [[ -n "$PUBLIC_IP" ]] && break
  sleep 5
done

echo
if [[ -z "$PUBLIC_IP" ]]; then
  echo "Instance $INSTANCE_ID created but no public IP yet. Check the console." >&2
  exit 1
fi

cat <<SUMMARY
Instance ready.

  instance   $INSTANCE_ID
  public IP  $PUBLIC_IP
  ssh        ssh -i $KEY_FILE root@$PUBLIC_IP

Next:
  1. Point DNS at it. In crusher-infra, set TF_VAR_AMANSIGNAL_ECS_IP=$PUBLIC_IP
     in Terraform Cloud, then merge dev to main to apply the A record.
  2. Wait for the record to resolve, then on the instance:
       git clone https://github.com/itxcrusher/aman-signal.git && cd aman-signal
       export DASHSCOPE_API_KEY=sk-...
       export AMANSIGNAL_DOMAIN=amansignal.muhammadhassaanjaved.com
       export CERTBOT_EMAIL=you@example.com
       sudo -E bash deploy/provision.sh
SUMMARY
