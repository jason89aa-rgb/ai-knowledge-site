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
                    Dashboard
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/tools">
                  <Button variant="ghost" className="w-full justify-start">
                    AI Tools
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/about">
                  <Button variant="ghost" className="w-full justify-start">
                    About
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/contact">
                  <Button variant="ghost" className="w-full justify-start">
                    Contact
                  </Button>
                </Link>
              </li>
              <li>
                <Link href="/privacy">
                  <Button variant="ghost" className="w-full justify-start">
                    Privacy
                  </Button>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </aside>
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <header className="flex items-center">
          <h2 className="font-semibold text-2xl">AI Daily Briefing</h2>
        </header>
        
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle>Join Our Newsletter</CardTitle>
            <CardDescription>
              Get the latest AI tool reviews, prompt tips, and step-by-step guides straight to your inbox.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewsletterForm />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Latest Tutorial: Gemini Vision</CardTitle>
              <CardDescription>A deep dive into Gemini's multimodal capabilities.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Learn how to use Gemini Vision to analyze images and get rich descriptions. This tutorial covers API integration and practical examples.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI News Flash</CardTitle>
              <CardDescription>GPT-5 rumors and Claude 3.5 updates.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Stay updated with the hottest news in the AI world. We bring you daily summaries and key takeaways.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt Engineering Tips</CardTitle>
              <CardDescription>Mastering the art of effective prompting.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Unlock the full potential of AI models with our expert prompting techniques. From basic to advanced strategies.</p>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Open Source LLMs</CardTitle>
              <CardDescription>Exploring Llama, Mistral, and more.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Dive into the world of open-source large language models. Learn about their architectures, fine-tuning, and deployment.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
              <CardDescription>AI conferences and webinars.</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Don't miss out on important AI events. We curate a list of upcoming conferences, workshops, and webinars.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
