import fs from "fs/promises"

export let data
try {
  data = await fs.readFile("./data.json")
  data = JSON.parse(data)
} catch (error) {
  data = {
    userData: {}
  }
}

async function save() {
  if (process.env.SAVE_DATA !== "true") return
  try {
    await fs.writeFile("./data.json", JSON.stringify(data))
  } catch (error) {
    console.log(error)
  }
}

let savePromise = null

let saveInterval = setInterval(async () => {
  savePromise = save()
  await savePromise
  savePromise = null
}, 300000)

export async function saveAndClose() {
  clearInterval(saveInterval)
  if (savePromise) await savePromise
  await save()
}