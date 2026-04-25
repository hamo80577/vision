import { cn } from "./cn";

type BrandLockupProps = {
  logoSrc: string;
  title: string;
  subtitle?: string;
  className?: string;
};

export function BrandLockup(props: BrandLockupProps) {
  return (
    <div className={cn("ui-brand-lockup", props.className)}>
      <img className="ui-brand-lockup__logo" src={props.logoSrc} alt={props.title} />
      <div className="ui-brand-lockup__copy">
        <span className="ui-brand-lockup__title">{props.title}</span>
        {props.subtitle ? <span className="ui-brand-lockup__subtitle">{props.subtitle}</span> : null}
      </div>
    </div>
  );
}
