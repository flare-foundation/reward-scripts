#!/bin/bash

SCRIPTDIR="$(dirname "${0}")"
ROOTDIR="${SCRIPTDIR}/../.."
if [ -z $2 ]; then
    REPORTPREFIX="${ROOTDIR}/reward-report-${1}"
    DATAFILE="${ROOTDIR}/generated-files/reward-epoch-${1}/data.json"
    REWARDMANAGERFILE="${ROOTDIR}/generated-files/reward-epoch-${1}/data.reward-manager.json"
    EPOCH_END=${1}
    JQQUERY='{ addresses: [ .recipients[] | .address ], rewardAmounts: [ .recipients[] | .amount ] }'
    jq "$JQQUERY" "$DATAFILE" > "$REWARDMANAGERFILE"
else
    REPORTPREFIX="${ROOTDIR}/reward-report-${1}-${2}"
    JQQUERY='{ recipients: [ .rewardAmounts as $amounts | .addresses | to_entries | .[] | { address: .value, amount: $amounts[.key] } ] }'
    JQSRC="generated-files/validator-rewards/epochs-${1}-${2}.json"
    JQDEST="generated-files/validator-rewards/epochs-${1}-${2}.normalized.json"
    jq "$JQQUERY" "$JQSRC" > "$JQDEST"
    DATAFILE="${ROOTDIR}/generated-files/validator-rewards/epochs-${1}-${2}.normalized.json"
    REWARDMANAGERFILE="${ROOTDIR}/generated-files/validator-rewards/epochs-${1}-${2}.json"
    EPOCH_END=${2}
fi

cp "${SCRIPTDIR}/reward-report.vue.prod.js" "${ROOTDIR}/reward-report.vue.prod.js"

rm -f "$REPORTPREFIX.html" "$REPORTPREFIX.reward-manager.json" "$REPORTPREFIX.data.json"
cp "${SCRIPTDIR}/reward-report.tpl.html" "$REPORTPREFIX.html"
cp "$REWARDMANAGERFILE" "$REPORTPREFIX.reward-manager.json"
cp "$DATAFILE" "$REPORTPREFIX.data.json"

CODE_COMMIT_HASH="$(git rev-parse HEAD)"
CODE_COMMIT_HASH_SHORT="$(git rev-parse --short HEAD)"

sed -i "s/{{EPOCH_START}}/${1}/g" "$REPORTPREFIX.html"
sed -i "s/{{EPOCH_END}}/${EPOCH_END}/g" "$REPORTPREFIX.html"
sed -i "s/{{GENERATEDAT_UNIX_TIMESTAMP}}/$(date +%s)/g" "$REPORTPREFIX.html"
sed -i "s/{{CODE_COMMIT_HASH}}/${CODE_COMMIT_HASH}/g" "$REPORTPREFIX.html"
sed -i "s/{{CODE_COMMIT_HASH_SHORT}}/${CODE_COMMIT_HASH_SHORT}/g" "$REPORTPREFIX.html"
