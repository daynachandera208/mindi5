import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class User {

    @PrimaryGeneratedColumn()
    player_id: number;

    @Column({ unique: true })
    email_id: string;

    @Column("text")
    user_name: string;

    @Column("longblob")
    image: string

    @Column({ type: "bigint" })
    phone_no: number;

    @Column({ length: 1 })
    gender: string;

    @Column()
    coins: number;
}
