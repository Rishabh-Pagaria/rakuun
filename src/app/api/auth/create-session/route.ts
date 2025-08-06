import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { access_token, refresh_token, expires_at, user } = await request.json()

    if (!access_token || !user) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate a unique session token for extension-dashboard sync
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(expires_at * 1000) // Convert from Unix timestamp

    // Create session record in database
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('user_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
        metadata: {
          access_token,
          refresh_token,
          provider: 'google',
          created_by: 'extension'
        }
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Database error:', sessionError)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    // Update or create user profile
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.name,
        avatar_url: user.user_metadata?.avatar_url || user.picture,
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      console.error('Profile update error:', profileError)
      // Don't fail the request if profile update fails
    }

    return NextResponse.json({
      success: true,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session=${sessionToken}`
    })

  } catch (error) {
    console.error('Create session error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
