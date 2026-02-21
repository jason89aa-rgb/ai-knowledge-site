import { getCategories, getPostsByCategory } from '@/lib/posts';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamicParams = false;

export async function generateStaticParams() {
  const categories = getCategories();
  return categories.map((category) => ({
    category: category,
  }));
}

export default function CategoryPage({ params }: { params: { category: string } }) {
  const posts = getPostsByCategory(params.category);

  return (
    <main className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-8 capitalize">
        {params.category} Tutorials
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {posts.map((post) => (
          <Link 
            key={post.slug} 
            href={`/tools/${params.category}/${post.slug}`} 
            className="block"
          >
            <Card className="h-full hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="capitalize">{post.title}</CardTitle>
                <CardDescription>{post.date}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
