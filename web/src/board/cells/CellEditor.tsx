import type { Column, Item, User } from '../../../../shared/types';
import { TextCell } from './TextCell';
import { NumberCell } from './NumberCell';
import { CheckboxCell } from './CheckboxCell';
import { LinkCell } from './LinkCell';
import { RatingCell } from './RatingCell';
import { StatusCell } from './StatusCell';
import { PeopleCell } from './PeopleCell';
import { DateCell } from './DateCell';
import { TimelineCell } from './TimelineCell';
import { CellDisplay } from './CellDisplay';
import { AiCell } from './AiCell';
import { FileCell } from './FileCell';
import { FormulaCell } from './FormulaCell';
import { DependencyCell } from './DependencyCell';
import { ConnectCell } from './ConnectCell';
import { MirrorCell } from './MirrorCell';
import { TimeTrackingCell } from './TimeTrackingCell';

export interface CellEditorProps {
  column: Column;
  item: Item;
  users: Map<number, User>;
  boardId: number;
  statusDone: boolean;
}

export function CellEditor(props: CellEditorProps) {
  switch (props.column.type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
      return <TextCell {...props} />;
    case 'number':
      return <NumberCell {...props} />;
    case 'checkbox':
      return <CheckboxCell {...props} />;
    case 'link':
      return <LinkCell {...props} />;
    case 'rating':
      return <RatingCell {...props} />;
    case 'status':
      return <StatusCell {...props} />;
    case 'dropdown':
      return <StatusCell {...props} />;
    case 'people':
      return <PeopleCell {...props} />;
    case 'date':
      return <DateCell {...props} />;
    case 'timeline':
      return <TimelineCell {...props} />;
    case 'ai':
      return <AiCell {...props} />;
    case 'file':
      return <FileCell {...props} />;
    case 'formula':
      return <FormulaCell {...props} />;
    case 'dependency':
      return <DependencyCell {...props} />;
    case 'connect':
      return <ConnectCell {...props} />;
    case 'mirror':
      return <MirrorCell {...props} />;
    case 'time_tracking':
      return <TimeTrackingCell {...props} />;
    default:
      return (
        <CellDisplay
          column={props.column}
          value={props.item.values[String(props.column.id)]}
          users={props.users}
          statusDone={props.statusDone}
        />
      );
  }
}
