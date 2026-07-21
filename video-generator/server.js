import express from 'express'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1kb' }))

// The standalone recorder/HeyGen service is retired for the invite-only MVP.
// Keep a fail-closed deployment artifact so any forgotten Railway deployment
// cannot spend quota or mutate Supabase through its historical service key.
app.use('/api', (_req, res) => {
  res.status(410).json({
    error: 'Video generation is not available',
    code: 'VIDEO_GENERATION_DISABLED',
  })
})

app.get('/health', (_req, res) => {
  res.status(410).json({ status: 'retired' })
})

const port = Number.parseInt(process.env.PORT || '3001', 10)
app.listen(port, () => {
  console.log(`Retired video service tombstone listening on port ${port}`)
})
