import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code } = req.body

  if (!code) {
    return res.status(400).json({ error: 'Registration code is required' })
  }

  // Get the secret registration code from server-side environment variable
  // This is NOT prefixed with VITE_ so it's never exposed to the client
  const serverCode = process.env.REGISTRATION_CODE

  if (!serverCode) {
    console.error('REGISTRATION_CODE environment variable is not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  // Validate the code
  if (code === serverCode) {
    return res.status(200).json({ valid: true })
  } else {
    return res.status(401).json({ valid: false, error: 'Invalid registration code' })
  }
}
