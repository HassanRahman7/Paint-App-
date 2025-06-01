
"use client";

import React, { useState } from 'react';
import type { CanvasSheet } from '@/lib/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit2, Copy, Trash2, Check, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';

interface SheetTabsProps {
  sheets: CanvasSheet[];
  activeSheetId: string;
  onAddSheet: () => void;
  onSwitchSheet: (sheetId: string) => void;
  onRenameSheet: (sheetId: string, newName: string) => void;
  onDuplicateSheet: (sheetId: string) => void;
  onDeleteSheet: (sheetId: string) => void;
  className?: string;
}

export function SheetTabs({
  sheets,
  activeSheetId,
  onAddSheet,
  onSwitchSheet,
  onRenameSheet,
  onDuplicateSheet,
  onDeleteSheet,
  className
}: SheetTabsProps) {
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleStartRename = (sheet: CanvasSheet) => {
    setRenamingSheetId(sheet.id);
    setRenameValue(sheet.name);
  };

  const handleConfirmRename = () => {
    if (renamingSheetId && renameValue.trim()) {
      onRenameSheet(renamingSheetId, renameValue.trim());
    }
    setRenamingSheetId(null);
    setRenameValue('');
  };

  const handleCancelRename = () => {
    setRenamingSheetId(null);
    setRenameValue('');
  };
  
  if (!sheets) return null;

  return (
    <div className={cn("flex items-center gap-2 p-2 border-b", className)}>
      <Tabs value={activeSheetId} onValueChange={onSwitchSheet} className="flex-grow">
        <TabsList className="bg-transparent p-0">
          {sheets.map((sheet) => (
            <div key={sheet.id} className="relative group mr-1">
              <TabsTrigger 
                value={sheet.id} 
                className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none h-9 px-3 py-1.5"
              >
                {renamingSheetId === sheet.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleConfirmRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename();
                        if (e.key === 'Escape') handleCancelRename();
                      }}
                      className="h-6 px-1 text-sm"
                      autoFocus
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleConfirmRename}><Check className="h-3 w-3"/></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancelRename}><X className="h-3 w-3"/></Button>
                  </div>
                ) : (
                  <span className="truncate max-w-[100px] sm:max-w-[150px]" title={sheet.name}>{sheet.name}</span>
                )}
              </TabsTrigger>
              {renamingSheetId !== sheet.id && (
                 <div className="absolute top-0 right-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 pr-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleStartRename(sheet)} title="Rename sheet">
                        <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onDuplicateSheet(sheet.id)} title="Duplicate sheet">
                        <Copy className="h-3 w-3" />
                    </Button>
                    {sheets.length > 1 && (
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" title="Delete sheet">
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the sheet "{sheet.name}".
                                </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDeleteSheet(sheet.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                 </div>
              )}
            </div>
          ))}
        </TabsList>
      </Tabs>
      <Button variant="outline" size="sm" onClick={onAddSheet} className="ml-auto">
        <PlusCircle className="h-4 w-4 mr-2" /> Add Sheet
      </Button>
    </div>
  );
}
