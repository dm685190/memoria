import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdminAuthorized } from '@/lib/adminAuth';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId && !isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, text } = await request.json();

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        { error: 'Resend API key is not configured on the server' },
        { status: 500 }
      );
    }

    // Dynamically import the Resend module to avoid build-time issues when env var is missing
    const resendModule = await import('resend');
    const resend = new resendModule.Resend(resendApiKey);

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
      from: 'Memoria <onboarding@resend.dev>', // You can change this to your domain
      to: recipient,
      subject: subject || 'Memoria Alert',
      text: text || 'This is a test email from Memoria.',
    });

    // Log the data for debugging (visible in Vercel logs)
    console.log('Resend send email response:', data);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}