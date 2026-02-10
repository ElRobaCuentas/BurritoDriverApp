import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { SendCoordinates } from './screen/SendCoordinates'

export const DriverApp = () => {
  return (
    
    <SafeAreaProvider>
        <SafeAreaView style={{flex:1, borderWidth: 2, borderColor: 'blue'}}>
            <SendCoordinates />
        </SafeAreaView>
    </SafeAreaProvider>


  )
}