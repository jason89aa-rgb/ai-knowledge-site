import { getCategories } from '@/lib/posts';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ToolsPage() {
  const categories = getCategories();

  return (
    <main className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
        All AI Tools
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category) => (
          <Link 
            key={category} 
            href={`/tools/${category}`}
            className="block"
          >
            <Card className="h-full hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="capitalize">{category}</CardTitle>
                <CardDescription>Explore tutorials and guides for {category}.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
