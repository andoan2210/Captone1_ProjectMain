import bcrypt = require('bcrypt');
const saltRounds = 10;

export const hashPasswordHelpers = async (password: string) => {
    try {
        return await bcrypt.hash(password, saltRounds);
    } catch (error) {
        console.log(error);
        throw error;
    }
}

export const comparePasswordHelpers = async (password: string, hash: string) => {
    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        console.log(error);
        throw error;
    }
}   