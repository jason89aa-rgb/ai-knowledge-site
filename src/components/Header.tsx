import Link from 'next/link';

export default function Header() {
  return (
    <header className="p-4 border-b">
      <nav className="container mx-auto flex justify-between">
        <Link href="/" className="font-bold text-lg">
          AI Learning Site
        </Link>
        <ul className="flex gap-4">
          <li>
            <Link href="/tools" className="hover:underline">Tools</Link>
          </li>
          <li>
            <Link href="/about" className="hover:underline">About</Link>
          </li>
          <li>
            <Link href="/contact" className="hover:underline">Contact</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
