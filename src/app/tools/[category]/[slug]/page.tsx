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
    <article className="prose lg:prose-xl p-8">
      <h1>{title}</h1>
      <div className="text-gray-600">{date}</div>
      {compiledContent}
    </article>
  );
}
