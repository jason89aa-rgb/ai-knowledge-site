import { getCategories, getPostsByCategory } from '@/lib/posts';
import Link from 'next/link';

export async function generateStaticParams() {
  const categories = getCategories();
  return categories.map((category) => ({
    category: category,
  }));
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  const posts = getPostsByCategory(params.category);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold capitalize">{params.category}</h1>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {posts.map((post) => (
          <Link key={post.slug} href={`/tools/${params.category}/${post.slug}`} className="block p-4 border rounded-lg hover:bg-gray-100">
            <h2 className="text-xl font-semibold">{post.title}</h2>
            <p className="text-gray-600">{post.date}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
