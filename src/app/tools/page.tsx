import { getCategories } from '@/lib/posts';
import Link from 'next/link';

export default function ToolsPage() {
  const categories = getCategories();

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">AI Tools</h1>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <Link key={category} href={`/tools/${category}`} className="block p-4 border rounded-lg hover:bg-gray-100">
            <h2 className="text-xl font-semibold capitalize">{category}</h2>
          </Link>
        ))}
      </div>
    </main>
  );
}
