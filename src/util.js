export function getIpFromHeader(string) {
  let ips = string.split(",")
  return ips[ips.length - 1]
}

export function getChannelType(id) {
  if (id.startsWith("lobby")) {
    if (id === "lobby") return 2
    let afterPart = id.substring(5)
    if (afterPart.match(/^\d+$/) || afterPart === "NaN") return 2
  } else if (id.startsWith("test/")) {
    return 1
  }
  return 0
}

export function incrementLobby(id) {
  if (id === "lobby") return "lobby2"
  let afterPart = id.substring(5)
  if (afterPart === "NaN") return "lobby1"
  let parsed = parseInt(afterPart)
  //wrap around to prevent an infinite recursion crash exploit where some numbers (like 9007199254740992) stay the same when 1 is added
  if (parsed > Number.MAX_SAFE_INTEGER) parsed = 0
  return `lobby${parsed + 1}`
}

let textEncoder = new TextEncoder()
export function stringToArrayBuffer(string) {
  return textEncoder.encode(string).buffer
}

export function arrayBufferToString(arrayBuffer) {
  return Buffer.from(arrayBuffer).toString()
}