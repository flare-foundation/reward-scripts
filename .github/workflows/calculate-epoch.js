const startDate = new Date(1658430005000)

const diffInMs = new Date() - startDate
const diff = (diffInMs / 1000 / 60 / 60) / 84
//           (      diff in hours      )    `- epoch increases every 84 hours
const currentEpoch = Math.floor(diff)
console.log(currentEpoch)