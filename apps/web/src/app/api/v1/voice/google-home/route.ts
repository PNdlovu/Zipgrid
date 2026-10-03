/**
 * @file route.ts
 * @description POST /api/v1/voice/google-home — Google Home / Google Assistant Action endpoint.
 * Handles Dialogflow/Actions on Google webhook requests for the Zipgrid Google Action.
 *
 * Intents handled:
 *   - Default Welcome Intent
 *   - find.charger, book.charger, session.status, stop.charging
 *   - spend.query, check.earnings, start.charging
 *
 * Setup: In Dialogflow console, set fulfillment webhook to this URL.
 * Google Actions uses the Dialogflow request/response format.
 *
 * env: GOOGLE_ACTION_PROJECT_ID — Google Cloud project ID for verification
 *
 * @module apps/web/api/v1/voice/google-home
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'

type DialogflowRequest = {
  responseId: string
  queryResult: {
    queryText: string
    action: string
    intent: { name: string; displayName: string }
    parameters: Record<string, string>
    outputContexts?: Array<{ name: string; parameters?: Record<string, string> }>
  }
  originalDetectIntentRequest?: {
    source: string
    payload?: { user?: { userStorage?: string; userId?: string } }
  }
}

/** Build a Dialogflow fulfillment response. */
function fulfillmentText(text: string): NextResponse {
  return NextResponse.json({
    fulfillmentText: text,
    fulfillmentMessages: [{ text: { text: [text] } }],
  })
}

/** Call the Zipgrid AI agent. */
async function callAgent(userId: string, input: string, role = 'driver'): Promise<string> {
  const aiUrl  = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000'
  const secret = process.env['AI_SERVICE_SECRET'] ?? ''
  try {
    const res = await fetch(`${aiUrl}/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Secret': secret },
      body: JSON.stringify({ input, role, ai_mode: 'hybrid', user_id: userId, context: {} }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return "Sorry, I'm having trouble reaching Zipgrid right now."
    const json = await res.json() as { output?: string }
    return json.output ?? 'Done.'
  } catch {
    return "Zipgrid isn't available right now. Please try again in a moment."
  }
}

/** Resolve Google user → Zipgrid userId via account linking. */
async function resolveUser(userId: string | undefined): Promise<string | null> {
  if (!userId) return null
  // Production: look up google_account_links table
  return null
}

/** POST /api/v1/voice/google-home — Google Home / Google Assistant Action endpoint. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: DialogflowRequest
  try {
    body = await request.json() as DialogflowRequest
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const intentName = body.queryResult?.intent?.displayName ?? ''
  const params     = body.queryResult?.parameters ?? {}
  const googleUserId = body.originalDetectIntentRequest?.payload?.user?.userId
  const zipgridUserId = await resolveUser(googleUserId)

  if (!zipgridUserId && !['Default Welcome Intent', 'Help'].includes(intentName)) {
    return fulfillmentText(
      'To use Zipgrid with Google Home, please link your account first. '
      + 'Open the Google Home app, go to Settings, then Link Services, and find Zipgrid.'
    )
  }

  switch (intentName) {
    case 'Default Welcome Intent':
      return fulfillmentText(
        'Welcome to Zipgrid! I can help you find EV chargers, check your session, or query your earnings. What do you need?'
      )

    case 'find.charger': {
      const location = params['location'] ?? ''
      const result = await callAgent(zipgridUserId!, `Find an available EV charger${location ? ` near ${location}` : ''}`, 'driver')
      return fulfillmentText(result)
    }

    case 'book.charger': {
      const result = await callAgent(zipgridUserId!, 'Book the nearest available EV charger for me', 'driver')
      return fulfillmentText(result)
    }

    case 'start.charging': {
      const time = params['time'] ?? 'midnight'
      const result = await callAgent(zipgridUserId!, `Schedule charging to start at ${time} using the cheapest tariff`, 'driver')
      return fulfillmentText(result)
    }

    case 'session.status': {
      const result = await callAgent(zipgridUserId!, 'What is my current charging session status?', 'driver')
      return fulfillmentText(result)
    }

    case 'stop.charging': {
      const result = await callAgent(zipgridUserId!, 'Stop my current charging session now', 'driver')
      return fulfillmentText(result)
    }

    case 'spend.query': {
      const period = params['period'] ?? 'this month'
      const result = await callAgent(zipgridUserId!, `How much have I spent on charging ${period}?`, 'driver')
      return fulfillmentText(result)
    }

    case 'check.earnings': {
      const period = params['period'] ?? 'this month'
      const result = await callAgent(zipgridUserId!, `What are my charger hosting earnings ${period}?`, 'host')
      return fulfillmentText(result)
    }

    default:
      return fulfillmentText(
        "I didn't quite catch that. You can ask me to find a charger, check your session, or tell you your earnings."
      )
  }
}
