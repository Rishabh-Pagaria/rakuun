import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { session_token } = await request.json()

    if (!session_token) {
      return NextResponse.json(
        { error: 'Session token is required' },
        { status: 400 }
      )
    }

    // Validate session token and check if it's not expired
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('user_sessions')
      .select(`
        *,
        user_profiles (
          id,
          email,
          full_name,
          avatar_url
        )
      `)
      .eq('session_token', session_token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      )
    }

    // Extract the stored tokens from metadata
    const { access_token, refresh_token } = session.metadata

    return NextResponse.json({
      valid: true,
      user: {
        id: session.user_id,
        email: session.user_profiles?.email,
        full_name: session.user_profiles?.full_name,
        avatar_url: session.user_profiles?.avatar_url
      },
      tokens: {
        access_token,
        refresh_token
      },
      expires_at: session.expires_at
    })

  } catch (error) {
    console.error('Validate session error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session_token } = await request.json()

    if (!session_token) {
      return NextResponse.json(
        { error: 'Session token is required' },
        { status: 400 }
      )
    }

    // Delete the session
    const { error } = await supabaseAdmin
      .from('user_sessions')
      .delete()
      .eq('session_token', session_token)

    if (error) {
      console.error('Delete session error:', error)
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Delete session error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
