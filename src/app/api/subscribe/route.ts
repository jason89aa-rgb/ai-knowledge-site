import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  console.log("[API] /api/subscribe 호출됨");
  try {
    const { email } = await request.json();
    console.log("[API] 이메일 수신:", email);

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "유효한 이메일 주소를 입력해 주세요." }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 1. Check environment variables
    if (!resendApiKey || !supabaseUrl || !supabaseAnonKey) {
       console.error("[API] 환경변수 누락:", {
           resend: !!resendApiKey,
           supabaseUrl: !!supabaseUrl,
           supabaseAnonKey: !!supabaseAnonKey
       });
       return NextResponse.json({ error: "서버 설정 오류가 발생했습니다." }, { status: 500 });
    }

    // Initialize Clients inside the handler
    const resend = new Resend(resendApiKey);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log("[API] Supabase 데이터베이스 저장 시도...");
    // 2. Insert into Supabase (Table: subscribers, Column: email)
    const { data: dbData, error: dbError } = await supabase
        .from("subscribers")
        .insert([{ email }])
        .select();

    if (dbError) {
        // Check if it's a unique constraint violation (already subscribed)
        if (dbError.code === "23505") {
            console.log("[API] 이미 구독 중인 이메일:", email);
            return NextResponse.json({ error: "이미 구독 중인 이메일입니다." }, { status: 400 });
        }
        
        // Exact error logging requested by user
        console.error("Supabase Error:", dbError);
        return NextResponse.json({ error: "데이터베이스 저장 중 오류가 발생했습니다." }, { status: 500 });
    }
    console.log("[API] Supabase 저장 성공:", dbData);

    console.log("[API] 환영 이메일 발송 시도...");
    // 3. Send Welcome Email via Resend
    const { error: emailError } = await resend.emails.send({
        from: "AI Learning Hub <onboarding@resend.dev>", // Replace with your verified domain
        to: [email],
        subject: "Welcome to AI Learning Hub!",
        html: `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
            <h2>구독해주셔서 감사합니다! 🎉</h2>
            <p>AI Learning Hub 뉴스레터 구독이 완료되었습니다.</p>
            <p>최신 AI 툴 리뷰, 프롬프트 팁, 가이드를 이메일로 보내드릴게요.</p>
            <p>앞으로 유익한 소식 기대해 주세요!</p>
        </div>
        `,
    });

    if (emailError) {
        console.error("Resend Error:", emailError);
        // Even if email fails, we already saved to DB, but we return 500 as requested for "strict" handling
        return NextResponse.json({ error: "환영 이메일 발송 중 오류가 발생했습니다." }, { status: 500 });
    }
    console.log("[API] 이메일 발송 성공");

    console.log("[API] Resend Contacts 추가 시도...");
    // 4. Add to Resend Audience (Contacts)
    const { error: contactError } = await resend.contacts.create({
        email: email,
    });

    if (contactError) {
        console.error("Resend Contact Error:", contactError);
        // We log the error but don't fail the whole request since they are already in DB and email was sent
    } else {
        console.log("[API] Contacts 추가 성공");
    }

    return NextResponse.json({ success: true, message: "구독이 완료되었습니다!" }, { status: 200 });

  } catch (error) {
    console.error("Subscription Error:", error);
    return NextResponse.json({ error: "내부 서버 오류가 발생했습니다." }, { status: 500 });
  }
}
