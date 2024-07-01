import events from 'events';
import {IDatabase} from '../tstype';
import {Adapter} from '../../adapter';

abstract class Entity extends events.EventEmitter {
    protected static database: IDatabase = null;
    protected static adapter: Adapter = null;

    public static injectDatabase(database: IDatabase): void {
        Entity.database = database;
    }

    public static injectAdapter(adapter: Adapter): void {
        Entity.adapter = adapter;
    }
}

export default Entity;
