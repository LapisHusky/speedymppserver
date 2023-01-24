import { stringToArrayBuffer } from "./util.js"

export class BinaryReader {
  constructor(buffer) {
    this.buffer = buffer
    this.index = 0
  }

  reachedEnd() {
    return this.index >= this.buffer.length
  }

  readUInt8() {
    if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
    return this.buffer[this.index++]
  }

  readUInt16() {
    if (this.index + 2 > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += 2
    return this.buffer.readUInt16LE(this.index - 2)
  }

  readUserId() {
    if (this.index + 12 > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += 12
    return this.buffer.toString("hex", this.index - 12, this.index)
  }

  readColor() {
    if (this.index + 3 > this.buffer.length) throw new Error("Invalid buffer read")
    return (this.buffer[this.index++] << 16) | (this.buffer[this.index++] << 8) | this.buffer[this.index++]
  }

  readBitflag(bit) {
    if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
    return (this.buffer[this.index] >> bit & 0b1) === 1
  }

  readVarlong() {
    let num = this.buffer[this.index++]
    if (num < 128) return num
    num = num & 0b1111111
    let factor = 128
    while (true) {
      //we don't really need to check if this varlong is too long
      let thisValue = this.buffer[this.index++]
      if (thisValue < 128) {
        return num + thisValue * factor
      } else {
        if (this.index >= this.buffer.length) throw new Error("Invalid buffer read")
        num += (thisValue & 0b1111111) * factor
      }
      factor *= 128
    }
  }

  readString() {
    let byteLength = this.readVarlong()
    if (this.index + byteLength > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += byteLength
    return this.buffer.toString("utf8", this.index - byteLength, this.index)
  }

  readBuffer(length) {
    if (this.index + length > this.buffer.length) throw new Error("Invalid buffer read")
    this.index += length
    return this.buffer.subarray(this.index - length, this.index)
  }
}

export class BinaryWriter {
  constructor() {
    this.buffers = []
  }

  writeUInt8(value) {
    this.buffers.push(Buffer.alloc(1, value))
  }

  writeUInt16(value) {
    let buf = Buffer.allocUnsafe(2)
    buf.writeUInt16LE(value)
    this.buffers.push(buf)
  }

  writeUserId(value) {
    this.buffers.push(Buffer.from(value, "hex"))
  }

  writeColor(value) {
    this.buffers.push(Buffer.from([value >> 16, (value >> 8) & 0xff, value & 0xff]))
  }

  writeVarlong(value) {
    let length = 1
    let threshold = 128
    while (value >= threshold) {
      length++
      threshold *= 128
    }
    let buf = Buffer.allocUnsafe(length)
    for (let i = 0; i < length - 1; i++) {
      let segment = value % 128
      value = Math.floor(value / 128)
      buf[i] = 0b10000000 | segment
    }
    buf[length - 1] = value
    this.buffers.push(buf)
  }

  writeString(string) {
    let stringBuffer = Buffer.from(stringToArrayBuffer(string))
    this.writeVarlong(stringBuffer.length)
    this.buffers.push(stringBuffer)
  }

  writeBuffer(buffer) {
    this.buffers.push(buffer)
  }

  getBuffer() {
    let length = 0
    for (let buffer of this.buffers) {
      length += buffer.length
    }
    let outputBuffer = Buffer.allocUnsafeSlow(length)
    let index = 0
    for (let buffer of this.buffers) {
      buffer.copy(outputBuffer, index)
      index += buffer.length
    }
    return outputBuffer
  }
}