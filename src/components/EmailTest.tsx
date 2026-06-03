'use client';

import { useState } from 'react';

export default function EmailTest() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Test email from Robin Cloud',
          text: 'This is a test email sent via Resend integration.',
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResult(`Email sent successfully! ID: ${data.id}`);
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="email-test">
      <button 
        onClick={handleSend}
        disabled={sending}
        className="email-test-button"
      >
        {sending ? 'Sending...' : 'Send Test Email'}
      </button>
      {result && (
        <p className={`email-test-result ${result.startsWith('Error') ? 'error' : 'success'}`}>
          {result}
        </p>
      )}
    </div>
  );
}