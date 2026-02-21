export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">Contact Us</h1>
      <div className="bg-card p-6 rounded-lg shadow-md max-w-2xl mx-auto text-center">
        <p className="text-lg text-muted-foreground">
          If you have any questions, feedback, or inquiries, please don't hesitate to reach out to us.
        </p>
        <p className="text-lg text-muted-foreground mt-4">
          You can email us at:
        </p>
        <p className="text-xl font-semibold text-primary mt-2">
          contact@ai-learning-hub.com
        </p>
        <p className="text-lg text-muted-foreground mt-4">
          We aim to respond to all inquiries within 24-48 hours.
        </p>
      </div>
    </div>
  );
}
