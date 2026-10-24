import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  component: Contact,
});

function Contact() {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Message sent. Our team will respond soon.");
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      <div className="mb-10 text-center">
        <Badge variant="outline" className="mb-3 border-primary/40 text-primary">
          <MessageSquare className="mr-1.5 h-3 w-3" /> Contact
        </Badge>
        <h1 className="text-4xl font-bold">Talk to ScamShield</h1>
        <p className="mt-3 text-muted-foreground">
          Questions, reports, partnership requests, and student safety support.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="glass p-6 lg:col-span-2">
          <div className="space-y-5 text-sm">
            <Info icon={Mail} label="Email" value="support@internshield.com" />
            <Info icon={Phone} label="Phone" value="+91 8591189235" />
            <Info icon={MapPin} label="Office" value="Student Innovation Cell, India" />
          </div>
        </Card>
        <Card className="p-6 lg:col-span-3">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input required type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input required />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea required rows={5} />
            </div>
            <Button className="bg-gradient-cyber shadow-glow">Send Message</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted/40 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-muted-foreground">{value}</div>
      </div>
    </div>
  );
}
