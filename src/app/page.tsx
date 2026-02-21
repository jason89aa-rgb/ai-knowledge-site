import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NewsletterForm } from "@/components/NewsletterForm";

export default function Dashboard() {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      <aside className="hidden border-r bg-muted/40 lg:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-[60px] items-center border-b px-6">
            <h1 className="font-semibold text-xl">AI Learning Hub</h1>
          </div>
          <nav className="flex-1 overflow-auto py-2">
            <ul className="grid items-start gap-2 text-sm font-medium">
              <li>
                <Link href="/">
                  <Button variant="ghost" className="w-full justify-start">
                    대시보드
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/tools">
                  <Button variant="ghost" className="w-full justify-start">
                    AI 도구
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/about">
                  <Button variant="ghost" className="w-full justify-start">
                    소개
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/contact">
                  <Button variant="ghost" className="w-full justify-start">
                    문의하기
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/privacy">
                  <Button variant="ghost" className="w-full justify-start">
                    개인정보처리방침
                  </Button>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </aside>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <header className="flex items-center">
          <h2 className="font-semibold text-2xl">AI 데일리 브리핑</h2>
        </header>
        
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle>📬 매주 AI 꿀팁을 받아보세요</CardTitle>
            <CardDescription>
              가장 핫한 AI 뉴스와 실전 프롬프트 가이드를 이메일로 보내드립니다.<br />
              스팸은 보내지 않습니다. 언제든 구독 취소 가능합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewsletterForm />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>최신 튜토리얼: Gemini Vision</CardTitle>
              <CardDescription>Gemini의 멀티모달 능력을 깊이 있게 파헤쳐 봅니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Gemini Vision을 사용하여 이미지를 분석하고 풍부한 설명을 얻는 방법을 배워보세요. API 통합과 실제 활용 사례를 다룹니다.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI 뉴스 플래시</CardTitle>
              <CardDescription>GPT-5 루머와 Claude 3.5 업데이트 소식.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>AI 업계의 가장 핫한 소식을 확인하세요. 매일 핵심 요약과 주요 포인트를 전달해 드립니다.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>프롬프트 엔지니어링 팁</CardTitle>
              <CardDescription>효과적인 프롬프트 작성 기술 마스터하기.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>전문가들의 프롬프트 기법으로 AI 모델의 잠재력을 최대한 끌어내세요. 기초부터 심화 전략까지 제공합니다.</p>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>오픈소스 LLM</CardTitle>
              <CardDescription>Llama, Mistral 등 다양한 모델 탐색.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>오픈소스 거대 언어 모델의 세계로 뛰어들어 보세요. 구조, 미세 조정 및 배포 방법을 알아봅니다.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>예정된 이벤트</CardTitle>
              <CardDescription>AI 컨퍼런스 및 웨비나 일정.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>중요한 AI 이벤트를 놓치지 마세요. 엄선된 컨퍼런스, 워크숍, 웨비나 리스트를 공유합니다.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
