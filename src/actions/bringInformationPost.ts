import axios from "axios";
import { UserProfile } from "../data/personMock";


const WEBHOOK_URL = 'https://webhook.site/84120173-14ce-4260-97f9-4470396ffe4c'


//funcion de realizar el envio de los datos. Retorna una promesa para decirnos si simplemente se envió o no (si/no)
export const sendUserData = async (user: UserProfile): Promise<boolean> => {
    try {
        //realizamos una petición post enviando el objeto user como cuerpo
        const response = await axios.post(WEBHOOK_URL, user);
        return response.status >= 200 && response.status < 300; //devuelve un true

    } catch (error) {
        console.log( 'HUBO UN PROBLEMA CON EL ENVIO DE DATOS' )
        return false;
    }
}