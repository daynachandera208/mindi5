import 'reflect-metadata';
import { createConnection } from 'typeorm';


export class DbUtils {

    static connection: any = null;

    static connect = async () => {
        try {
            const con = await createConnection();
            return con;   
        } catch (error) {
            console.log('Error while connecting to Database');
            console.log(error);   
        }
    }

    static getConnection = async () => {
        if(!DbUtils.connection) {
            DbUtils.connection = await DbUtils.connect();
        }

        return DbUtils.connection;
    }
}