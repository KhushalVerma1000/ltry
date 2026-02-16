import { hash, compare } from "bcrypt";


async function passwordHash(password: string): Promise<string> {
    const saltRounds = 10;
    return await hash(password, saltRounds);
}

async function comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await compare(plainPassword, hashedPassword);
}


export { passwordHash, comparePassword};