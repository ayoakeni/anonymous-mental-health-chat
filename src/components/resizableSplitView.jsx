import { useState, useEffect, useRef } from "react";
import "../styles/resizableSplitView.css";

const ResizableSplitView = ({
  leftPanel,
  rightPanel,
  initialRatio = 0.3,   // 30 % left on first render
  minLeft = 180,
  maxLeft = null,
  minRight = 180,
  maxRight = null,
}) => {
  const containerRef = useRef(null);
  const splitterRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(0);

  // --------------------------------------------------------------
  // Initialise width once the container is mounted
  // --------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || leftWidth > 0) return;

    const total = container.clientWidth;
    const init = total * initialRatio;

    const maxFromRight = maxRight ? total - maxRight : Infinity;
    const effectiveMax = maxLeft !== null ? Math.min(maxLeft, maxFromRight) : maxFromRight;

    const clamped = Math.max(
      minLeft,
      Math.min(init, effectiveMax, total - minRight)
    );

    setLeftWidth(clamped);
  }, [initialRatio, minLeft, maxLeft, minRight, maxRight, leftWidth]);

  // --------------------------------------------------------------
  // Drag handling
  // --------------------------------------------------------------
  const onMouseDown = (downE) => {
    downE.preventDefault();

    const startX = downE.clientX;
    const startLeft = leftWidth;
    const container = containerRef.current;

    const onMouseMove = (moveE) => {
      const delta = moveE.clientX - startX;
      const total = container.clientWidth;
      const raw = startLeft + delta;

      // ---- LEFT limits ----
      const min = minLeft;
      const maxL = maxLeft ?? total - minRight;

      // ---- RIGHT limits (maxRight) ----
      const maxFromRight = maxRight ? total - maxRight : Infinity;
      const max = Math.min(maxL, maxFromRight);

      const newWidth = Math.max(min, Math.min(raw, max));
      setLeftWidth(newWidth);

      // Optional visual cue when a limit is hit
      const atMin = newWidth === min;
      const atMax = newWidth === max;
      splitterRef.current?.classList.toggle("limit-min", atMin);
      splitterRef.current?.classList.toggle("limit-max", atMax);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      splitterRef.current?.classList.remove("limit-min", "limit-max");
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // --------------------------------------------------------------
  // Render
  // --------------------------------------------------------------
  return (
    <div ref={containerRef} className="resizable-split-container">
      {/* LEFT */}
      <div
        className="resizable-left"
        style={{ width: leftWidth ? `${leftWidth}px` : undefined }}
      >
        {leftPanel}
      </div>

      {/* SPLITTER */}
      <div
        ref={splitterRef}
        className="resizable-splitter"
        onMouseDown={onMouseDown}
        role="separator"
        aria-label="Resize panels"
        aria-valuenow={leftWidth}
        aria-valuemin={minLeft}
        aria-valuemax={maxLeft ?? "auto"}
      />

      {/* RIGHT */}
      <div className="resizable-right">{rightPanel}</div>
    </div>
  );
};

export default ResizableSplitView;