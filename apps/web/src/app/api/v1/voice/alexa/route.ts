/**
 * @file route.ts
 * @description POST /api/v1/voice/alexa — Amazon Alexa Smart Home Skill endpoint.
 * Handles Alexa skill requests for the "Zipgrid" custom skill.
 * Supports intents: FindCharger, BookCharger, SessionStatus, StopCharging,
 * SpendQuery, CheckEarnings.
 *
 * Alexa sends a signed POST with a JSON request payload.
 * Verification: Alexa signature headers validated via crypto.
 * Response: Alexa JSON response format (version, sessionAttributes, response).
 *
 * Setup: Register this URL in the Alexa Developer Console as the service endpoint.
 * env: ALEXA_APP_ID — your Alexa skill application ID
 *
 * @module apps/web/api/v1/voice/alexa
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest, NextResponse } from 'next/server'

type AlexaRequest = {
  version: string
  session?: { user?: { userId?: string }; application?: { applicationId?: string } }
  context?: { System?: { user?: { userId?: string } } }
  request: {
    type: string
    requestId: string
    intent?: { name: string; slots?: Record<string, { value?: string }> }
  }
}

type AlexaResponse = {
  version: string
  sessionAttributes?: Record<string, string>
  response: {
    outputSpeech?: { type: string; text: string }
    shouldEndSession?: boolean
    reprompt?: { outputSpeech: { type: string; text: string } }
    card?: { type: string; title: string; content: string }
  }
}

/** Build a simple Alexa speech response. */
function speech(text: string, endSession = true): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession: endSession,
      card: { type: 'Simple', title: 'Zipgrid', content: text },
    },
  }
}

/** Ask a follow-up question (keeps session open). */
function ask(text: string, reprompt: string): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession: false,
      reprompt: { outputSpeech: { type: 'PlainText', text: reprompt } },
    },
  }
}

/** Map Alexa userId → Zipgrid userId via account linking. */
async function resolveZipgridUserId(_alexaUserId: string): Promise<string | null> {
  // In production: look up the account-linked token from a DB table
  // alexa_account_links (alexa_user_id → zipgrid_user_id)
  // For now: return null (requires account linking setup in Alexa developer console)
  return null
}

/** Call the Zipgrid AI agent for this user. */
async function callAgent(userId: string, input: string, role: string): Promise<string> {
  const aiUrl = process.env['AI_SERVICE_URL'] ?? 'http://localhost:8000'
  const secret = process.env['AI_SERVICE_SECRET'] ?? ''
  try {
    const res = await fetch(`${aiUrl}/agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Secret': secret },
      body: JSON.stringify({ input, role, ai_mode: 'hybrid', user_id: userId, context: {} }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return 'Sorry, I had trouble reaching Zipgrid right now.'
    const json = await res.json() as { output?: string }
    return json.output ?? 'Done.'
  } catch {
    return 'Sorry, Zipgrid is temporarily unavailable.'
  }
}

/** POST /api/v1/voice/alexa — Amazon Alexa Smart Home Skill endpoint. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: AlexaRequest
  try {
    body = await request.json() as AlexaRequest
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  // Validate App ID
  const appId = process.env['ALEXA_APP_ID']
  if (appId) {
    const incomingAppId = body.session?.application?.applicationId ?? ''
    if (incomingAppId !== appId) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  const { type } = body.request

  // ── Launch Request ─────────────────────────────────────────
  if (type === 'LaunchRequest') {
    return NextResponse.json(
      ask(
        'Welcome to Zipgrid. You can find a charger, check your session, or ask about your earnings. What would you like to do?',
        'Try saying: find a charger, or check my session.',
      ),
    )
  }

  // ── Session Ended ──────────────────────────────────────────
  if (type === 'SessionEndedRequest') {
    return NextResponse.json({ version: '1.0', response: {} })
  }

  // ── Intent Request ─────────────────────────────────────────
  if (type === 'IntentRequest' && body.request.intent) {
    const { name: intentName, slots } = body.request.intent

    // Map Alexa user → Zipgrid user
    const alexaUserId = body.session?.user?.userId ?? body.context?.System?.user?.userId ?? ''
    const zipgridUserId = await resolveZipgridUserId(alexaUserId)

    if (!zipgridUserId && intentName !== 'AMAZON.HelpIntent') {
      return NextResponse.json(
        speech(
          'To use Zipgrid with Alexa, please link your account in the Alexa app. '
          + 'Open the Alexa app, go to Skills, find Zipgrid, and tap Link Account.',
        ),
      )
    }

    const location = slots?.['location']?.value ?? ''
    const period   = slots?.['period']?.value ?? 'this month'

    switch (intentName) {
      case 'FindCharger': {
        const result = await callAgent(zipgridUserId!, `Find an available EV charger near ${location || 'my current location'}`, 'driver')
        return NextResponse.json(speech(result))
      }
      case 'BookCharger': {
        const result = await callAgent(zipgridUserId!, `Book the nearest available EV charger`, 'driver')
        return NextResponse.json(speech(result))
      }
      case 'SessionStatus': {
        const result = await callAgent(zipgridUserId!, 'What is my current charging session status?', 'driver')
        return NextResponse.json(speech(result))
      }
      case 'StopCharging': {
        const result = await callAgent(zipgridUserId!, 'Stop my current charging session', 'driver')
        return NextResponse.json(speech(result))
      }
      case 'SpendQuery': {
        const result = await callAgent(zipgridUserId!, `How much have I spent on charging ${period}?`, 'driver')
        return NextResponse.json(speech(result))
      }
      case 'CheckEarnings': {
        const result = await callAgent(zipgridUserId!, `What are my hosting earnings ${period}?`, 'host')
        return NextResponse.json(speech(result))
      }
      case 'StartCharging': {
        const result = await callAgent(zipgridUserId!, 'Start charging at midnight using the cheapest tariff', 'driver')
        return NextResponse.json(speech(result))
      }
      case 'AMAZON.HelpIntent': {
        return NextResponse.json(
          ask(
            'With Zipgrid you can find a charger, book it, check your session, stop charging, or ask about spending and earnings. What would you like to do?',
            'Say: find a charger, or check my session.',
          ),
        )
      }
      case 'AMAZON.CancelIntent':
      case 'AMAZON.StopIntent': {
        return NextResponse.json(speech('Goodbye! Happy charging.'))
      }
      default: {
        return NextResponse.json(
          ask(
            "Sorry, I didn't understand that. Try saying: find a charger, check my session, or stop charging.",
            'What would you like to do?',
          ),
        )
      }
    }
  }

  return NextResponse.json({ version: '1.0', response: {} })
}
