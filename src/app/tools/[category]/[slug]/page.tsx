import { getAllPostParams, getPostData } from '@/lib/posts';
import { compileMDX } from 'next-mdx-remote/rsc';

export async function generateStaticParams() {
  const paths = getAllPostParams();
  return paths;
}

export default async function PostPage({ params }: { params: { category: string, slug: string } }) {
  const { title, date, content } = await getPostData(params.category, params.slug);
  const { content: compiledContent } = await compileMDX({
    source: content,
    options: { parseFrontmatter: false },
  });

  return (
    <main className="container mx-auto px-4 py-12">
      <article className="prose lg:prose-xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800">{title}</h1>
          <p className="text-gray-500 mt-2">{date}</p>
        </header>
        <div className="text-lg">
          {compiledContent}
        </div>
      </article>
    </main>
  );
}
