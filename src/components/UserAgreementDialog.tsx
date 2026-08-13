import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  USER_AGREEMENT_TITLE,
  USER_AGREEMENT_INTRO,
  USER_AGREEMENT_SECTIONS,
  USER_AGREEMENT_CLOSING,
} from "@/lib/userAgreement";

export function UserAgreementBody() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p>{USER_AGREEMENT_INTRO}</p>
      {USER_AGREEMENT_SECTIONS.map((section) => (
        <div key={section.heading} className="space-y-1">
          <h3 className="font-semibold text-foreground">{section.heading}</h3>
          <ul className="list-disc pl-5 space-y-1">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="font-medium text-foreground">{USER_AGREEMENT_CLOSING}</p>
    </div>
  );
}

interface UserAgreementDialogProps {
  trigger?: React.ReactNode;
}

export function UserAgreementDialog({ trigger }: UserAgreementDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <button type="button" className="text-primary underline underline-offset-2">
            {USER_AGREEMENT_TITLE}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{USER_AGREEMENT_TITLE}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <UserAgreementBody />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
