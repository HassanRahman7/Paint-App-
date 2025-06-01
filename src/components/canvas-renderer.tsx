
"use client";

import type { DrawingTool, Point, TextElementData, ImageActionData, DrawingAction, ShapeAction, FreehandAction, LineAction, TextAction, EraserAction, ImageDrawingAction } from '@/lib/types';
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';


export interface CanvasRendererHandle {
  getCanvasElement: () => HTMLCanvasElement | null;
  downloadDrawing: (filename: string) => void;
  getTextElementById: (id: string) => Promise<TextElementData | null>;
  getTextElementIdAtPoint: (point: Point) => Promise<string | null>;
  // No direct getShapeIdAtPoint exposed, selection is initiated from within via onShapeSelect
}

interface CanvasRendererProps {
  drawingHistory: DrawingAction[];
  historyIndex: number;

  tool: DrawingTool;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  isFillEnabled: boolean;

  currentTextFormatting: Omit<TextElementData, 'id' | 'text' | 'x' | 'y' | 'measuredWidth' | 'measuredHeight'>;
  currentEditingTextId?: string | null;
  selectedShapeId?: string | null;

  onCommitAction: (action: Omit<DrawingAction, 'id' | 'visible'>) => void;
  onTextSelect?: (id: string) => void;
  onTextDragEnd?: (id: string, x: number, y: number, textElement: TextElementData | null) => void;
  onShapeSelect?: (id: string, data: ShapeAction) => void;
}


const CanvasRenderer = forwardRef<CanvasRendererHandle, CanvasRendererProps>(
  ({
    drawingHistory, historyIndex,
    tool, strokeColor, strokeWidth, fillColor, isFillEnabled,
    currentTextFormatting, currentEditingTextId, selectedShapeId,
    onCommitAction, onTextSelect, onTextDragEnd, onShapeSelect
  }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<CanvasRenderingContext2D | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const currentPathRef = useRef<Point[]>([]);
    const [canvasSnapshotForPreview, setCanvasSnapshotForPreview] = useState<ImageData | null>(null);

    const [draggingTextId, setDraggingTextId] = useState<string | null>(null);
    const [dragStartOffset, setDragStartOffset] = useState<Point | null>(null);
    const [currentDragPosition, setCurrentDragPosition] = useState<Point | null>(null);

    const [mouseCanvasPosition, setMouseCanvasPosition] = useState<Point | null>(null);
    const [isMouseOnCanvas, setIsMouseOnCanvas] = useState<boolean>(false);

    const imageElementsCache = useRef<Map<string, HTMLImageElement>>(new Map());

    const getCoordinates = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;

      if ('clientX' in event && 'clientY' in event) {
        clientX = event.clientX; clientY = event.clientY;
      } else if ('touches' in event && event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX; clientY = event.touches[0].clientY;
      } else if ('changedTouches' in event && event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX; clientY = event.changedTouches[0].clientY;
      } else { return null; }

      if (clientX === undefined || clientY === undefined) return null;
      // Return logical coordinates (CSS pixels relative to canvas)
      return { x: clientX - rect.left, y: clientY - rect.top };
    }, []);

    const drawTextElement = (ctx: CanvasRenderingContext2D, data: TextElementData, isSelected?: boolean) => {
        ctx.font = `${data.isBold ? 'bold ' : ''}${data.isItalic ? 'italic ' : ''}${data.fontSize}px ${data.fontFamily}`;
        ctx.fillStyle = data.textColor;
        ctx.textAlign = data.textAlign;
        ctx.fillText(data.text, data.x, data.y);

        if (data.isUnderline) {
            const metrics = ctx.measureText(data.text);
            let underlineStartX = data.x;
            if (data.textAlign === 'left') underlineStartX = data.x;
            else if (data.textAlign === 'center') underlineStartX = data.x - metrics.width / 2;
            else underlineStartX = data.x - metrics.width;

            const baselineOffset = data.fontSize * 0.1;
            ctx.fillRect(underlineStartX, data.y + baselineOffset + 2, metrics.width, Math.max(1, data.fontSize / 15));
        }

        if (isSelected) {
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
            ctx.lineWidth = 1; // Logical pixel width
            ctx.setLineDash([4, 2]);
            const padding = 5;
            let boxX = data.x;
            if (data.textAlign === 'left') boxX = data.x - padding;
            else if (data.textAlign === 'center') boxX = data.x - data.measuredWidth / 2 - padding;
            else boxX = data.x - data.measuredWidth - padding;

            ctx.strokeRect(boxX, data.y - data.measuredHeight - padding, data.measuredWidth + padding * 2, data.measuredHeight + padding * 2 );
            ctx.setLineDash([]);
        }
    };

    const drawSpecificShapeAction = (ctx: CanvasRenderingContext2D, action: ShapeAction | LineAction | FreehandAction, isSelected?: boolean) => {
      ctx.strokeStyle = action.strokeColor;
      ctx.lineWidth = action.strokeWidth;
      ctx.globalCompositeOperation = 'source-over';

      if (action.type === 'freehand') {
          if (action.points && action.points.length > 1) {
            ctx.beginPath(); ctx.moveTo(action.points[0].x, action.points[0].y);
            for (let j = 1; j < action.points.length; j++) ctx.lineTo(action.points[j].x, action.points[j].y);
            ctx.stroke();
          }
      } else if (action.type === 'line') {
           if (action.startPoint && action.endPoint) {
            ctx.beginPath(); ctx.moveTo(action.startPoint.x, action.startPoint.y);
            ctx.lineTo(action.endPoint.x, action.endPoint.y); ctx.stroke();
          }
      } else if (action.type === 'rectangle' || action.type === 'circle' || action.type === 'triangle') {
          ctx.fillStyle = action.fillColor || '#000000'; // Default fill if undefined
          let path: Path2D | undefined;

          if (action.type === 'rectangle') {
              if (action.startPoint && action.endPoint) {
                  const rectX = Math.min(action.startPoint.x, action.endPoint.x);
                  const rectY = Math.min(action.startPoint.y, action.endPoint.y);
                  const rectWidth = Math.abs(action.startPoint.x - action.endPoint.x);
                  const rectHeight = Math.abs(action.startPoint.y - action.endPoint.y);
                  path = new Path2D();
                  path.rect(rectX, rectY, rectWidth, rectHeight);
              }
          } else if (action.type === 'circle') {
              if (action.startPoint && action.endPoint) {
                  const radius = Math.sqrt(Math.pow(action.endPoint.x - action.startPoint.x, 2) + Math.pow(action.endPoint.y - action.startPoint.y, 2));
                  path = new Path2D();
                  path.arc(action.startPoint.x, action.startPoint.y, radius, 0, 2 * Math.PI);
              }
          } else if (action.type === 'triangle') {
              if (action.startPoint && action.endPoint) {
                  path = new Path2D();
                  path.moveTo(action.startPoint.x, action.startPoint.y);
                  path.lineTo(action.endPoint.x, action.endPoint.y);
                  path.lineTo(action.startPoint.x - (action.endPoint.x - action.startPoint.x), action.endPoint.y);
                  path.closePath();
              }
          }
          if (path) {
            if (action.isFilled) ctx.fill(path);
            ctx.stroke(path);

            if (isSelected) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 123, 255, 0.7)';
                ctx.lineWidth = 2; // Highlight with thicker logical stroke
                ctx.setLineDash([6, 3]);
                ctx.stroke(path);
                ctx.restore();
            }
          }
      }
    };

    const redrawCanvas = useCallback(() => {
      const ctx = contextRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return;

      // Use logical dimensions for clearing
      ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

      const latestActionDataById = new Map<string, DrawingAction>();
      for (let i = 0; i <= historyIndex; i++) {
        const action = drawingHistory[i];
        if (action.visible === false) {
            // If an item is marked not visible, and it was previously in the map, remove it
            if (latestActionDataById.has(action.id)) {
                latestActionDataById.delete(action.id);
            }
            continue;
        }
        latestActionDataById.set(action.id, action);
      }

      const imagesToLoad: Promise<void>[] = [];

      latestActionDataById.forEach((action) => {
        ctx.globalCompositeOperation = 'source-over';
        if (action.type === 'text') {
            const textData = action.data;
            ctx.font = `${textData.isBold ? 'bold ' : ''}${textData.isItalic ? 'italic ' : ''}${textData.fontSize}px ${textData.fontFamily}`;
            const metrics = ctx.measureText(textData.text);
            // Update measured dimensions if not already set or if text changed
            if (!textData.measuredWidth || !textData.measuredHeight || textData.text !== action.data.text) {
                 action.data.measuredWidth = metrics.width;
                 action.data.measuredHeight = textData.fontSize; // Approximation
            }
            if (draggingTextId === action.id && currentDragPosition) {
                drawTextElement(ctx, { ...textData, x: currentDragPosition.x, y: currentDragPosition.y }, currentEditingTextId === action.id);
            } else {
                drawTextElement(ctx, textData, currentEditingTextId === action.id);
            }
        } else if (action.type === 'eraser') {
            const { points, size } = action;
            for (const point of points) {
                ctx.clearRect(point.x - size / 2, point.y - size / 2, size, size);
            }
        } else if (action.type === 'image') {
            let img = imageElementsCache.current.get(action.data.src);
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, action.data.x, action.data.y, action.data.width, action.data.height);
            } else if (!img || (!img.complete && !img.dataset.loading)) {
                const newImg = new Image();
                newImg.dataset.loading = 'true';
                imageElementsCache.current.set(action.data.src, newImg);
                const loadPromise = new Promise<void>((resolve, reject) => {
                    newImg.onload = () => { delete newImg.dataset.loading; resolve(); };
                    newImg.onerror = () => { delete newImg.dataset.loading; console.error("Error loading image:", action.data.src); reject(); };
                });
                newImg.src = action.data.src;
                imagesToLoad.push(loadPromise.finally(() => requestAnimationFrame(redrawCanvas)));
            }
        } else { // ShapeAction, LineAction, FreehandAction
            drawSpecificShapeAction(ctx, action as ShapeAction | LineAction | FreehandAction, action.id === selectedShapeId);
        }
      });


      if (tool === 'eraser' && !isDrawing && isMouseOnCanvas && mouseCanvasPosition && ctx) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.7)';
          ctx.lineWidth = 1;
          const previewSize = strokeWidth;
          ctx.strokeRect(mouseCanvasPosition.x - previewSize / 2, mouseCanvasPosition.y - previewSize / 2, previewSize, previewSize);
          ctx.restore();
      }
    }, [drawingHistory, historyIndex, currentEditingTextId, selectedShapeId, draggingTextId, currentDragPosition, tool, isDrawing, isMouseOnCanvas, mouseCanvasPosition, strokeWidth]);


    const initializeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !containerRef.current) return;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect();

      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      context.scale(dpr, dpr); // Scale context for HDPIdisplays

      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.textBaseline = 'alphabetic';
      contextRef.current = context;
      redrawCanvas();
    }, [redrawCanvas]);

    useEffect(() => {
      initializeCanvas();
      const resizeTarget = containerRef.current;
      if (!resizeTarget) return;
      const obs = new ResizeObserver(initializeCanvas);
      obs.observe(resizeTarget);
      return () => obs.unobserve(resizeTarget);
    }, [initializeCanvas]);


    useEffect(() => {
        requestAnimationFrame(redrawCanvas);
    }, [drawingHistory, historyIndex, redrawCanvas, selectedShapeId, currentEditingTextId]);


    useEffect(() => {
        if (tool === 'eraser' && !isDrawing) {
            requestAnimationFrame(redrawCanvas);
        }
    }, [mouseCanvasPosition, isMouseOnCanvas, tool, isDrawing, redrawCanvas]);

    const isPointInRectangle = (point: Point, rectStart: Point, rectEnd: Point): boolean => {
        const x1 = Math.min(rectStart.x, rectEnd.x);
        const y1 = Math.min(rectStart.y, rectEnd.y);
        const x2 = Math.max(rectStart.x, rectEnd.x);
        const y2 = Math.max(rectStart.y, rectEnd.y);
        return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
    };

    const isPointInCircle = (point: Point, center: Point, end: Point): boolean => {
        const radius = Math.sqrt(Math.pow(end.x - center.x, 2) + Math.pow(end.y - center.y, 2));
        const dist = Math.sqrt(Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2));
        return dist <= radius;
    };

    const signTriangle = (p1: Point, p2: Point, p3: Point): number => {
      return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
    }

    const isPointInTriangle = (pt: Point, v1: Point, v2: Point, v3: Point): boolean => {
      const d1 = signTriangle(pt, v1, v2);
      const d2 = signTriangle(pt, v2, v3);
      const d3 = signTriangle(pt, v3, v1);
      const has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !(has_neg && has_pos);
    };

    const getShapeIdAtPointInternal = useCallback((point: Point): { id: string, data: ShapeAction } | null => {
        // Iterate in reverse to check top-most elements first
        const latestActionDataById = new Map<string, DrawingAction>();
        for (let i = 0; i <= historyIndex; i++) {
            const action = drawingHistory[i];
            if (action.visible !== false) { // Consider only visible actions
                latestActionDataById.set(action.id, action);
            } else {
                if (latestActionDataById.has(action.id)) {
                    latestActionDataById.delete(action.id);
                }
            }
        }
        
        const reversedActions = Array.from(latestActionDataById.values()).reverse();

        for (const action of reversedActions) {
            if (action.type === 'rectangle' && action.startPoint && action.endPoint) {
                if (isPointInRectangle(point, action.startPoint, action.endPoint)) return { id: action.id, data: action };
            } else if (action.type === 'circle' && action.startPoint && action.endPoint) {
                if (isPointInCircle(point, action.startPoint, action.endPoint)) return { id: action.id, data: action };
            } else if (action.type === 'triangle' && action.startPoint && action.endPoint) {
                const p1 = action.startPoint;
                const p2 = action.endPoint;
                const p3 = { x: p1.x - (p2.x - p1.x), y: p2.y };
                if (isPointInTriangle(point, p1, p2, p3)) return { id: action.id, data: action };
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const getTextElementAtPointInternal = useCallback((point: Point): TextElementData | null => {
        const ctx = contextRef.current;
        if (!ctx) return null;

        const latestTextElements = new Map<string, TextElementData>();
        for (let i = 0; i <= historyIndex; i++) {
            const action = drawingHistory[i];
             if (action.type === 'text' && (action.visible !== false)) {
                ctx.font = `${action.data.isBold ? 'bold ' : ''}${action.data.isItalic ? 'italic ' : ''}${action.data.fontSize}px ${action.data.fontFamily}`;
                const metrics = ctx.measureText(action.data.text);
                latestTextElements.set(action.id, { ...action.data, measuredWidth: metrics.width, measuredHeight: action.data.fontSize });
            } else if (action.type === 'text' && action.visible === false && latestTextElements.has(action.id)){
                latestTextElements.delete(action.id);
            }
        }

        for (const textData of Array.from(latestTextElements.values()).reverse()) {
            let x1 = textData.x;
            if (textData.textAlign === 'left') x1 = textData.x;
            else if (textData.textAlign === 'center') x1 = textData.x - textData.measuredWidth / 2;
            else x1 = textData.x - textData.measuredWidth;

            const y1 = textData.y - textData.measuredHeight;
            const x2 = x1 + textData.measuredWidth;
            const y2 = textData.y;

            if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
                return textData;
            }
        }
        return null;
    }, [drawingHistory, historyIndex]);


    const startDrawingInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();

      const nativeEvent = event.nativeEvent;
      const coords = getCoordinates(nativeEvent);
      if (!coords || !contextRef.current) return;

      // Text tool handles its own selection via parent's onClick on the container div
      if (tool === 'text') {
        const clickedText = getTextElementAtPointInternal(coords);
        if (clickedText && onTextSelect) {
            setDraggingTextId(clickedText.id);
            const offsetX = coords.x - clickedText.x;
            const offsetY = coords.y - clickedText.y;
            setDragStartOffset({ x: offsetX, y: offsetY });
            setCurrentDragPosition({x: clickedText.x, y: clickedText.y});
            onTextSelect(clickedText.id);
        } else {
            setDraggingTextId(null);
        }
        // If not clicking text, parent page.tsx's handleCanvasInteraction will place new text input.
        // So, do not set isDrawing = true here for text tool unless a drag is initiated.
        if (!clickedText) return; // Don't proceed to drawing if it's for new text placement
      } else {
        // For non-text tools, try shape selection first
        const selectedShape = getShapeIdAtPointInternal(coords);
        if (selectedShape && onShapeSelect) {
            onShapeSelect(selectedShape.id, selectedShape.data);
            return; // Stop here, shape selected, no drawing.
        }
      }

      setIsDrawing(true);
      setStartPoint(coords);
      currentPathRef.current = [coords];

      if (tool === 'eraser') {
          const eraserSize = strokeWidth;
          contextRef.current.clearRect(coords.x - eraserSize / 2, coords.y - eraserSize / 2, eraserSize, eraserSize);
      } else if (tool !== 'freehand' && tool !== 'text') {
        const dpr = window.devicePixelRatio || 1;
        setCanvasSnapshotForPreview(contextRef.current.getImageData(0, 0, contextRef.current.canvas.width / dpr, contextRef.current.canvas.height / dpr));
      }
    }, [getCoordinates, tool, getTextElementAtPointInternal, onTextSelect, onShapeSelect, strokeWidth, getShapeIdAtPointInternal]);

    const drawInternal = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (tool === 'image') return;

      const ctx = contextRef.current;
      if (!ctx || (!startPoint && !draggingTextId)) return;
      if (event.nativeEvent instanceof TouchEvent) event.preventDefault();

      const currentCoords = getCoordinates(event.nativeEvent);
      if (!currentCoords) return;

      if (draggingTextId && dragStartOffset && tool === 'text') {
        const newX = currentCoords.x - dragStartOffset.x;
        const newY = currentCoords.y - dragStartOffset.y;
        setCurrentDragPosition({x: newX, y: newY});
        requestAnimationFrame(redrawCanvas);
        return;
      }

      if (!isDrawing || tool === 'text' || !startPoint) return;

      if (tool === 'eraser') {
          currentPathRef.current.push(currentCoords);
          const eraserSize = strokeWidth;
          ctx.clearRect(currentCoords.x - eraserSize / 2, currentCoords.y - eraserSize / 2, eraserSize, eraserSize);
          return;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'source-over';

      if (tool === 'freehand') {
        currentPathRef.current.push(currentCoords);
        ctx.beginPath();
        if (currentPathRef.current.length > 1) {
             ctx.moveTo(currentPathRef.current[currentPathRef.current.length-2].x, currentPathRef.current[currentPathRef.current.length-2].y);
        } else {
            ctx.moveTo(startPoint.x, startPoint.y);
        }
        ctx.lineTo(currentCoords.x, currentCoords.y);
        ctx.stroke();
      } else {
        if (canvasSnapshotForPreview) ctx.putImageData(canvasSnapshotForPreview, 0, 0);
        else redrawCanvas(); // Fallback if snapshot somehow missing

        const tempActionBase = { id: '', type: tool as Exclude<DrawingTool, 'text' | 'eraser' | 'freehand' | 'image'>, strokeColor, strokeWidth };
        let tempAction: ShapeAction | LineAction;
        if (tool === 'line') {
            tempAction = { ...tempActionBase, type: 'line', startPoint, endPoint: currentCoords } as LineAction;
        } else { 
            tempAction = { ...tempActionBase, type: tool as 'rectangle' | 'circle' | 'triangle', fillColor, isFilled: isFillEnabled, startPoint, endPoint: currentCoords } as ShapeAction;
        }
        drawSpecificShapeAction(ctx, tempAction);
      }
    }, [isDrawing, startPoint, getCoordinates, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, canvasSnapshotForPreview, redrawCanvas, draggingTextId, dragStartOffset]);


    const handleMouseUpTouchEnd = useCallback((event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (tool === 'image') return;

        if (draggingTextId && currentDragPosition && onTextDragEnd && tool === 'text') {
            let originalTextElement: TextElementData | null = null;
            const latestTextActions = new Map<string, TextElementData>();
            drawingHistory.slice(0, historyIndex + 1).forEach(act => {
                if (act.type === 'text') latestTextActions.set(act.id, act.data);
            });
            originalTextElement = latestTextActions.get(draggingTextId) || null;

            if (originalTextElement) {
                 onTextDragEnd(draggingTextId, currentDragPosition.x, currentDragPosition.y, originalTextElement);
            }
            setDraggingTextId(null); setDragStartOffset(null); setCurrentDragPosition(null);
            requestAnimationFrame(redrawCanvas);
            return;
        }

        if (!isDrawing || !contextRef.current || !startPoint || tool === 'text') {
            if(isDrawing) setIsDrawing(false);
            return;
        }

        const nativeEvent = event.nativeEvent;
        const finalCoords = getCoordinates(nativeEvent);
        let newActionData: Omit<DrawingAction, 'id' | 'visible'> | null = null;

        const pathForAction = [...currentPathRef.current];
        const effectiveEndPoint = finalCoords || (pathForAction.length > 0 ? pathForAction[pathForAction.length -1] : startPoint);

        if (tool === 'freehand') {
            if (pathForAction.length > 0) {
                 newActionData = { type: 'freehand', points: pathForAction, strokeColor, strokeWidth };
            }
        } else if (tool === 'eraser') {
            if (pathForAction.length > 0) {
                newActionData = { type: 'eraser', points: pathForAction, size: strokeWidth };
            }
        } else if (tool === 'line') {
             newActionData = { type: 'line', startPoint, endPoint: effectiveEndPoint, strokeColor, strokeWidth };
        } else if (tool === 'rectangle' || tool === 'circle' || tool === 'triangle') {
             newActionData = { type: tool as 'rectangle' | 'circle' | 'triangle', startPoint, endPoint: effectiveEndPoint, strokeColor, strokeWidth, fillColor, isFilled: isFillEnabled };
        }

        if (newActionData) {
           onCommitAction(newActionData);
        }

        setIsDrawing(false); setStartPoint(null); currentPathRef.current = []; setCanvasSnapshotForPreview(null);
    }, [isDrawing, startPoint, tool, strokeColor, strokeWidth, fillColor, isFillEnabled, redrawCanvas, getCoordinates, draggingTextId, currentDragPosition, onTextDragEnd, onCommitAction, drawingHistory, historyIndex]);

    useImperativeHandle(ref, () => ({
      getCanvasElement: () => canvasRef.current,
      downloadDrawing: (filename: string) => {
        if (canvasRef.current && contextRef.current) {
            const canvas = canvasRef.current;
            const tempCanvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;

            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.fillStyle = '#FFFFFF';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                tempCtx.drawImage(canvas, 0, 0);

                const dataURL = tempCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = dataURL; link.download = filename;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            }
        }
      },
      getTextElementIdAtPoint: async (point: Point): Promise<string | null> => getTextElementAtPointInternal(point)?.id || null,
      getTextElementById: async (id: string): Promise<TextElementData | null> => {
        const ctx = contextRef.current;
        if (!ctx) return null;
        const latestTextAction = drawingHistory
            .slice(0, historyIndex + 1)
            .reverse()
            .find(action => action.type === 'text' && action.id === id && action.visible !== false) as TextAction | undefined;

        if (latestTextAction) {
            ctx.font = `${latestTextAction.data.isBold ? 'bold ' : ''}${latestTextAction.data.isItalic ? 'italic ' : ''}${latestTextAction.data.fontSize}px ${latestTextAction.data.fontFamily}`;
            const metrics = ctx.measureText(latestTextAction.data.text);
            return { ...latestTextAction.data, measuredWidth: metrics.width, measuredHeight: latestTextAction.data.fontSize };
        }
        return null;
      },
    }));

    const handleContainerMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) { setMouseCanvasPosition(null); return; }
        const rect = canvas.getBoundingClientRect();
        const clientX = event.clientX;
        const clientY = event.clientY;

        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
            setMouseCanvasPosition({ x: clientX - rect.left, y: clientY - rect.top });
        } else {
            setMouseCanvasPosition(null);
        }
    }, []);

    const handleContainerMouseEnter = useCallback(() => {
        setIsMouseOnCanvas(true);
    }, []);

    const handleContainerMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        setIsMouseOnCanvas(false);
        setMouseCanvasPosition(null);

        // If drawing a shape and mouse leaves canvas, finalize the shape
        if (isDrawing && startPoint && tool !== 'text' && tool !== 'eraser' && tool !== 'freehand' && tool !== 'image') {
            // Check if the event target is the canvas itself, otherwise this might trigger too often
             if (canvasRef.current && event.target === canvasRef.current) {
                 // Treat as mouseup
                 handleMouseUpTouchEnd(event as unknown as React.MouseEvent<HTMLCanvasElement>);
             }
        }
    }, [isDrawing, startPoint, tool, handleMouseUpTouchEnd]);


    return (
      <div
        ref={containerRef}
        className="w-full h-full touch-none"
        onMouseMove={handleContainerMouseMove}
        onMouseEnter={handleContainerMouseEnter}
        onMouseLeave={handleContainerMouseLeave}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawingInternal}
          onMouseMove={drawInternal}
  	      onMouseUp={handleMouseUpTouchEnd}
          onTouchStart={startDrawingInternal}
          onTouchMove={drawInternal}
  	      onTouchEnd={handleMouseUpTouchEnd}
          className="w-full h-full cursor-crosshair"
          data-ai-hint="drawing abstract background"
        />
      </div>
    );
  }
);

CanvasRenderer.displayName = 'CanvasRenderer';
export default CanvasRenderer;

