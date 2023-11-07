#!/bin/bash

SCRIPTDIR="$(dirname "${0}")"
ROOTDIR="${SCRIPTDIR}/../.."
if [ -z $2 ]; then
    DATAFILE="${ROOTDIR}/generated-files/reward-epoch-${1}/data.json"
    REPORTHTML="${ROOTDIR}/reward-report-${1}.html"
    REWARDMANAGERFILE="${ROOTDIR}/generated-files/reward-epoch-${1}/data.reward-manager.json"
    EPOCH_END=${1}
    JQQUERY='{ addresses: [ .recipients[] | .address ], rewardAmounts: [ .recipients[] | .amount ] }'
    jq "$JQQUERY" "$DATAFILE" > "$REWARDMANAGERFILE"
else
    JQQUERY='{ recipients: [ .rewardAmounts as $amounts | .addresses | to_entries | .[] | { address: .value, amount: $amounts[.key] } ], REWARD_AMOUNT_EPOCH_WEI: .rewardAmounts | [ .[] | tonumber ] | add | tostring }'
    JQSRC="generated-files/validator-rewards/epochs-${1}-${2}.json"
    JQDEST="generated-files/validator-rewards/epochs-${1}-${2}.normalized.json"
    jq "$JQQUERY" "$JQSRC" > "$JQDEST"
    DATAFILE="${ROOTDIR}/generated-files/validator-rewards/epochs-${1}-${2}.normalized.json"
    REWARDMANAGERFILE="${ROOTDIR}/generated-files/validator-rewards/epochs-${1}-${2}.json"
    REPORTHTML="${ROOTDIR}/reward-report-${1}-${2}.html"
    EPOCH_END=${2}
fi

rm -f "$REPORTHTML"
cp "${SCRIPTDIR}/reward-report.tpl.html" "$REPORTHTML"

CODE_COMMIT_HASH="$(git rev-parse HEAD)"
CODE_COMMIT_HASH_SHORT="$(git rev-parse --short HEAD)"

sed -i "s/{{EPOCH_START}}/${1}/g" "$REPORTHTML"
sed -i "s/{{EPOCH_END}}/${EPOCH_END}/g" "$REPORTHTML"
sed -i "s/{{DATA_REWARD_MANAGER}}/$(cat "${REWARDMANAGERFILE}" | jq --compact-output .)/g" "$REPORTHTML"
sed -i "s/{{DATA_DATA}}/$(cat "${DATAFILE}" | jq --compact-output .)/g" "$REPORTHTML"
sed -i "s/{{GENERATEDAT_UNIX_TIMESTAMP}}/$(date +%s)/g" "$REPORTHTML"
sed -i "s/{{CODE_COMMIT_HASH}}/${CODE_COMMIT_HASH}/g" "$REPORTHTML"
sed -i "s/{{CODE_COMMIT_HASH_SHORT}}/${CODE_COMMIT_HASH_SHORT}/g" "$REPORTHTML"
