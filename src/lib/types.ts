
export type DrawingTool = 'freehand' | 'line' | 'rectangle' | 'circle' | 'triangle' | 'text' | 'eraser' | 'image';

export interface Point {
  x: number;
  y: number;
}

export interface DrawingActionBase {
  id: string; 
  visible?: boolean; 
  type: DrawingTool | 'text' | 'image' | 'eraser'; // Ensure all specific actions have a type
}

export interface ShapeAction extends DrawingActionBase {
  type: Exclude<DrawingTool, 'text' | 'eraser' | 'image' | 'freehand' | 'line'>; // rectangle, circle, triangle
  strokeColor: string;
  strokeWidth: number;
  points?: Point[]; // For freehand if we adapt
  startPoint?: Point;
  endPoint?: Point;
  fillColor?: string;
  isFilled?: boolean;
}
export interface FreehandAction extends DrawingActionBase {
  type: 'freehand';
  points: Point[];
  strokeColor: string;
  strokeWidth: number;
}

export interface LineAction extends DrawingActionBase {
  type: 'line';
  startPoint: Point;
  endPoint: Point;
  strokeColor: string;
  strokeWidth: number;
}


export interface TextElementData {
  id: string; // This ID is for the text element itself, can be same as DrawingAction.id
  text: string;
  x: number; y: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textAlign: 'left' | 'center' | 'right';
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  measuredWidth: number;
  measuredHeight: number;
}

export interface TextAction extends DrawingActionBase {
    type: 'text';
    data: TextElementData;
}

export interface EraserAction extends DrawingActionBase {
    type: 'eraser';
    size: number;
    points: Point[];
}

export interface ImageActionData {
  id: string; // This ID is for the image element itself
  src: string; 
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDrawingAction extends DrawingActionBase {
  type: 'image';
  data: ImageActionData;
}

export type DrawingAction = ShapeAction | FreehandAction | LineAction | TextAction | EraserAction | ImageDrawingAction;

export interface CanvasSheet {
  id: string;
  name: string;
  drawingHistory: DrawingAction[];
  historyIndex: number;
  // Potentially add viewport state (zoom, pan) here in the future
}
