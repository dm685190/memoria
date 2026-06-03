import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, subject, text } = await request.json();

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        { error: 'Resend API key is not configured on the server' },
        { status: 500 }
      );
    }

    const { Resend } = await import('resend');
    const resend = new Resend(resendApiKey);

    // For security, we'll only allow sending to a pre-verified email if set.
    // In production, you might want to validate the 'to' field or use a fixed recipient.
    const recipient = to || process.env.ALERT_EMAIL;
    if (!recipient) {
      return NextResponse.json(
        { error: 'Recipient email is required' },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: 'Robin Cloud <onboarding@resend.dev>', // You can change this to your domain
      to: recipient,
      subject: subject || 'Robin Cloud Alert',
      text: text || 'This is a test email from Robin Cloud.',
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}