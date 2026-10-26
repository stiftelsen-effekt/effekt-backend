import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, MoonIcon, SunIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { ButtonsSection, FormSection, InputsSection } from "@/design-system/controls";
import { BadgesSection, DataDisplaySection, FeedbackSection } from "@/design-system/display";
import { OverlaysSection } from "@/design-system/overlays";
import { TokensSection } from "@/design-system/tokens";

export const Route = createFileRoute("/design/")({
  component: StyleGuide,
});

function StyleGuide() {
  const { resolved, toggle } = useTheme();
  return (
    <Page className="gap-12">
      <PageHeader
        eyebrow="Design system"
        title="Style guide"
        subtitle="Tokens and every component in each state. Monochrome, typographic, square; built for scanning money all day."
        actions={
          <>
            <Button variant="outline" onClick={toggle}>
              {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
              {resolved === "dark" ? "Light" : "Dark"} mode
            </Button>
            <Button variant="outline" asChild>
              <Link to="/design/list">
                List page
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/design/detail">
                Detail page
                <ArrowRightIcon />
              </Link>
            </Button>
          </>
        }
      />
      <TokensSection />
      <ButtonsSection />
      <InputsSection />
      <FormSection />
      <BadgesSection />
      <OverlaysSection />
      <DataDisplaySection />
      <FeedbackSection />
    </Page>
  );
}
