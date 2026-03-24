export interface FloatingWindowPosition {
  x: number;
  y: number;
}

export interface FloatingWindowSize {
  width: number;
  height: number;
}

export interface FloatingWindowViewport {
  width: number;
  height: number;
}

export interface FloatingWindowAnchor {
  top: number;
  right: number;
}

export interface FloatingWindowAvoidRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FLOATING_WINDOW_MARGIN_PX = 16;
export const FLOATING_WINDOW_OFFSET_PX = 64;

export function clampFloatingWindowPosition(
  position: FloatingWindowPosition,
  size: FloatingWindowSize,
  viewport: FloatingWindowViewport,
  margin = FLOATING_WINDOW_MARGIN_PX
): FloatingWindowPosition {
  const minimumX = margin;
  const minimumY = margin;
  const maximumX = Math.max(margin, viewport.width - size.width - margin);
  const maximumY = Math.max(margin, viewport.height - size.height - margin);

  return {
    x: clamp(position.x, minimumX, maximumX),
    y: clamp(position.y, minimumY, maximumY)
  };
}

export function resolveDefaultFloatingWindowPosition(
  size: FloatingWindowSize,
  viewport: FloatingWindowViewport,
  anchor?: FloatingWindowAnchor,
  margin = FLOATING_WINDOW_MARGIN_PX,
  offset = FLOATING_WINDOW_OFFSET_PX
): FloatingWindowPosition {
  const anchoredPosition = anchor
    ? {
        x: anchor.right - size.width - offset,
        y: anchor.top + offset
      }
    : {
        x: viewport.width - size.width - margin,
        y: margin
      };

  return clampFloatingWindowPosition(anchoredPosition, size, viewport, margin);
}

export function resolveAvoidingFloatingWindowPosition(
  size: FloatingWindowSize,
  viewport: FloatingWindowViewport,
  avoidRect?: FloatingWindowAvoidRect,
  anchor?: FloatingWindowAnchor,
  margin = FLOATING_WINDOW_MARGIN_PX,
  offset = FLOATING_WINDOW_OFFSET_PX
): FloatingWindowPosition {
  const defaultPosition = resolveDefaultFloatingWindowPosition(size, viewport, anchor, margin, offset);

  if (!avoidRect) {
    return defaultPosition;
  }

  if (resolveOverlapArea(defaultPosition, size, avoidRect) === 0) {
    return defaultPosition;
  }

  const avoidCenterX = avoidRect.x + avoidRect.width / 2;
  const avoidCenterY = avoidRect.y + avoidRect.height / 2;
  const preferLeftFirst = avoidCenterX >= viewport.width / 2;
  const preferAboveFirst = avoidCenterY >= viewport.height / 2;
  const preferredHorizontalCandidates = preferLeftFirst
    ? [
        { x: avoidRect.x - size.width - offset, y: avoidRect.y },
        { x: avoidRect.x + avoidRect.width + offset, y: avoidRect.y }
      ]
    : [
        { x: avoidRect.x + avoidRect.width + offset, y: avoidRect.y },
        { x: avoidRect.x - size.width - offset, y: avoidRect.y }
      ];
  const preferredVerticalCandidates = preferAboveFirst
    ? [
        { x: avoidRect.x + (avoidRect.width - size.width) / 2, y: avoidRect.y - size.height - offset },
        { x: avoidRect.x + (avoidRect.width - size.width) / 2, y: avoidRect.y + avoidRect.height + offset }
      ]
    : [
        { x: avoidRect.x + (avoidRect.width - size.width) / 2, y: avoidRect.y + avoidRect.height + offset },
        { x: avoidRect.x + (avoidRect.width - size.width) / 2, y: avoidRect.y - size.height - offset }
      ];
  const trailingHorizontalCandidates = preferLeftFirst
    ? [
        { x: avoidRect.x - size.width - offset, y: avoidRect.y + avoidRect.height - size.height },
        { x: avoidRect.x + avoidRect.width + offset, y: avoidRect.y + avoidRect.height - size.height }
      ]
    : [
        { x: avoidRect.x + avoidRect.width + offset, y: avoidRect.y + avoidRect.height - size.height },
        { x: avoidRect.x - size.width - offset, y: avoidRect.y + avoidRect.height - size.height }
      ];

  const candidates = [
    ...preferredHorizontalCandidates,
    ...preferredVerticalCandidates,
    ...trailingHorizontalCandidates,
    defaultPosition
  ].map((candidate) => clampFloatingWindowPosition(candidate, size, viewport, margin));

  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      overlapArea: resolveOverlapArea(candidate, size, avoidRect),
      distanceFromDefault: resolveDistanceSquared(candidate, defaultPosition)
    }))
    .sort((left, right) => {
      if (left.overlapArea !== right.overlapArea) {
        return left.overlapArea - right.overlapArea;
      }

      if (left.index !== right.index) {
        return left.index - right.index;
      }

      if (left.distanceFromDefault !== right.distanceFromDefault) {
        return left.distanceFromDefault - right.distanceFromDefault;
      }

      return 0;
    })[0]!.candidate;
}

export function resolveNextFloatingWindowPosition(
  currentPosition: FloatingWindowPosition | undefined,
  size: FloatingWindowSize,
  viewport: FloatingWindowViewport,
  avoidRect?: FloatingWindowAvoidRect,
  anchor?: FloatingWindowAnchor,
  margin = FLOATING_WINDOW_MARGIN_PX,
  offset = FLOATING_WINDOW_OFFSET_PX
): FloatingWindowPosition {
  const clampedCurrentPosition = currentPosition
    ? clampFloatingWindowPosition(currentPosition, size, viewport, margin)
    : undefined;

  if (clampedCurrentPosition && (!avoidRect || resolveOverlapArea(clampedCurrentPosition, size, avoidRect) === 0)) {
    return currentPosition && positionsMatch(currentPosition, clampedCurrentPosition)
      ? currentPosition
      : clampedCurrentPosition;
  }

  return resolveAvoidingFloatingWindowPosition(size, viewport, avoidRect, anchor, margin, offset);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function resolveOverlapArea(
  position: FloatingWindowPosition,
  size: FloatingWindowSize,
  avoidRect: FloatingWindowAvoidRect
): number {
  const overlapWidth = Math.max(
    0,
    Math.min(position.x + size.width, avoidRect.x + avoidRect.width) - Math.max(position.x, avoidRect.x)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(position.y + size.height, avoidRect.y + avoidRect.height) - Math.max(position.y, avoidRect.y)
  );

  return overlapWidth * overlapHeight;
}

function resolveDistanceSquared(left: FloatingWindowPosition, right: FloatingWindowPosition): number {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function positionsMatch(left: FloatingWindowPosition, right: FloatingWindowPosition): boolean {
  return left.x === right.x && left.y === right.y;
}
