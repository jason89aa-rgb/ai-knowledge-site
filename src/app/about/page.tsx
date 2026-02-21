export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">About Us</h1>
      <div className="bg-card p-6 rounded-lg shadow-md max-w-2xl mx-auto">
        <p className="text-lg text-muted-foreground">
          Welcome to the AI Learning Hub. Our mission is to provide comprehensive and automated resources
          for learning about the latest AI tools and technologies. We curate content from various sources,
          summarize it using advanced AI models, and present it in an easy-to-understand format.
        </p>
        <p className="text-lg text-muted-foreground mt-4">
          Our platform is designed to keep you updated with the fast-evolving AI landscape, from basic usage to advanced applications and industry trends.
        </p>
      </div>
    </div>
  );
}
