const url = process.env.HEALTH_URL ?? 'http://127.0.0.1:8000/health'

const run = async () => {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Health check failed (${response.status}): ${text}`)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})