import { StyleSheet, Text, View } from 'react-native'


interface Props {
  title: string
}


export const MyCustomHeader = ({title}: Props) => {
  return (
    <View style={styles.headerContainer}>
      <Text style={styles.titleText} > {title} </Text>
    </View>
  )
}


const styles = StyleSheet.create({

  headerContainer: {
    height: 65,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 10
  },

  titleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
  }
})