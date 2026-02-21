import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "유효한 이메일 주소를 입력해 주세요." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!resendApiKey || !supabaseUrl || !supabaseAnonKey) {
       console.error("🔥 Missing Environment Variables:", {
           RESEND_API_KEY: !!resendApiKey,
           NEXT_PUBLIC_SUPABASE_URL: !!supabaseUrl,
           NEXT_PUBLIC_SUPABASE_ANON_KEY: !!supabaseAnonKey
       });
       return NextResponse.json({ error: "서버 설정 오류가 발생했습니다." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 2. Insert into Supabase (Stricter error handling as requested)
    const { data, error } = await supabase.from('subscribers').insert([{ email }]);
    
    if (error) {
      console.error("🔥 Supabase Insert Error Details:", error);
      return NextResponse.json({ 
        error: error.message,
        code: error.code 
      }, { status: 500 });
    }

    // 3. Send Welcome Email via Resend using raw fetch (100% Edge Compatible)
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: "AI Learning Hub <onboarding@resend.dev>",
        to: [email],
        subject: "Welcome to AI Learning Hub!",
        html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
            <h2>구독해주셔서 감사합니다! 🎉</h2>
            <p>AI Learning Hub 뉴스레터 구독이 완료되었습니다.</p>
            <p>최신 AI 툴 리뷰, 프롬프트 팁, 가이드를 이메일로 보내드릴게요.</p>
            <p>앞으로 유익한 소식 기대해 주세요!</p>
        </div>
        `
      })
    });

    if (!emailRes.ok) {
        const errorData = await emailRes.text();
        console.error("🔥 Resend Error:", errorData);
        return NextResponse.json({ error: "환영 이메일 발송 중 오류가 발생했습니다." }, { status: 500 });
    }

    // 4. Add to Resend Audience (Contacts) using raw fetch
    // Note: Resend contacts API requires audience_id usually, but if the SDK allowed it without, it might be using default.
    // If it fails, we just log it as before.
    const contactRes = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        audience_id: process.env.RESEND_AUDIENCE_ID || undefined // Optional, if you have one
      })
    });

    if (!contactRes.ok) {
        const contactError = await contactRes.text();
        console.error("🔥 Resend Contact Error:", contactError);
    }

    return NextResponse.json({ success: true, message: "구독이 완료되었습니다!" }, { status: 200 });

  } catch (error: any) {
    console.error("🔥 Critical Subscription Error:", error);
    return NextResponse.json({ error: error.message || "내부 서버 오류가 발생했습니다." }, { status: 500 });
  }
}
