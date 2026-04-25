import { cn } from "./cn";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
};

export function SectionHeading(props: SectionHeadingProps) {
  return (
    <div className={cn("ui-page-heading", props.className)}>
      {props.eyebrow ? <p className="ui-page-heading__eyebrow">{props.eyebrow}</p> : null}
      <h1 className="ui-page-heading__title">{props.title}</h1>
      {props.description ? (
        <p className="ui-page-heading__description">{props.description}</p>
      ) : null}
    </div>
  );
}
