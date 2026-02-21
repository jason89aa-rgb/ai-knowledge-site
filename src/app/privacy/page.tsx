export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">Privacy Policy</h1>
      <div className="bg-card p-6 rounded-lg shadow-md max-w-3xl mx-auto">
        <p className="text-lg text-muted-foreground mb-4">
          [Placeholder for Privacy Policy content. You should replace this with a proper privacy policy.]
        </p>
        <p className="text-muted-foreground text-sm">
          Last Updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
