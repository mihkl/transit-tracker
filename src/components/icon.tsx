interface IconProps {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function Icon({ name, className, size, style }: IconProps) {
  const maskUrl = `/icons/${name}.svg`;
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        maskImage: `url(${maskUrl})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url(${maskUrl})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        ...style,
      }}
      role="img"
      aria-hidden="true"
    />
  );
}
