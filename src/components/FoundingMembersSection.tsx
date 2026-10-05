import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

interface FoundingMember {
  name: string;
  role: string;
}

// Curated list — no contact details are exposed publicly.
const FOUNDING_MEMBERS: FoundingMember[] = [
  { name: "Shyju V M", role: "Founding Member" },
  { name: "Sudevan P M", role: "Founding Member" },
  { name: "Manoj Kumar", role: "Founding Member" },
  { name: "Vinod M S", role: "Founding Member" },
];

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const FoundingMembersSection = () => {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge variant="secondary" className="mb-4 inline-flex items-center gap-1">
            <Crown className="h-3.5 w-3.5" />
            Our Founders
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Founding Members
          </h2>
          <p className="text-muted-foreground">
            The people who started Ela Bazar and continue to build our community of
            members across Karnataka.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {FOUNDING_MEMBERS.map((member) => (
            <Card
              key={member.name}
              className="border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg"
            >
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <div className="h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
                  {initials(member.name)}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{member.name}</h3>
                  <p className="text-sm text-muted-foreground">{member.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FoundingMembersSection;
