import React, { Component } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { GiftedChat, Send, Message } from 'react-native-gifted-chat';
import Chatkit from '@pusher/chatkit';
import axios from 'axios';
import Config from 'react-native-config';
import Icon from 'react-native-vector-icons/FontAwesome';
import { DocumentPicker, DocumentPickerUtil } from 'react-native-document-picker';
import * as mime from 'react-native-mime-types';
import Modal from 'react-native-modal';

import ChatBubble from '../components/ChatBubble';
import AudioPlayer from '../components/AudioPlayer';
import VideoPlayer from '../components/VideoPlayer';

const CHATKIT_INSTANCE_LOCATOR_ID = `v1:us1:${Config.CHATKIT_INSTANCE_LOCATOR_ID}`;
const CHATKIT_SECRET_KEY = Config.CHATKIT_SECRET_KEY;
const CHATKIT_TOKEN_PROVIDER_ENDPOINT = `https://us1.pusherplatform.io/services/chatkit_token_provider/v1/${Config.CHATKIT_INSTANCE_LOCATOR_ID}/token`;

const CHAT_SERVER = "YOUR NGROK HTTPS URL/rooms";

class Chat extends Component {

  static navigationOptions = ({ navigation }) => {
    const { params } = navigation.state;
    return {
      headerTitle: `Chat with ${params.friends_username}`
    };
  };

  state = {
    messages: [],
    is_initialized: false,
    is_picking_file: false,
    is_modal_visible: false,
    video_uri: null
  };


  constructor(props) {
    super(props);
    const { navigation } = this.props;
    const user_id = navigation.getParam("user_id");
    const username = navigation.getParam("username");
    const friends_username = navigation.getParam("friends_username");

    const members = [username, friends_username];
    members.sort();

    this.user_id = user_id;
    this.username = username;
    this.room_name = members.join("-");
  }


  async componentDidMount() {
    const tokenProvider = new Chatkit.TokenProvider({
      url: CHATKIT_TOKEN_PROVIDER_ENDPOINT
    });

    const chatManager = new Chatkit.ChatManager({
      instanceLocator: CHATKIT_INSTANCE_LOCATOR_ID,
      userId: this.user_id,
      tokenProvider: tokenProvider
    });

    try {
      let currentUser = await chatManager.connect();
      this.currentUser = currentUser;

      const response = await axios.post(
        CHAT_SERVER,
        {
          user_id: this.user_id,
          room_name: this.room_name
        }
      );

      const room = response.data;

      this.room_id = parseInt(room.id);
      await this.currentUser.subscribeToRoom({
        roomId: this.room_id,
        hooks: {
          onNewMessage: this.onReceive
        }
      });

      this.setState({
        is_initialized: true
      });

    } catch (err) {
      console.log("error with chat manager: ", err);
    }
  }


  onReceive = async (data) => {
    const { message } = await this.getMessage(data);

    await this.setState((previousState) => ({
      messages: GiftedChat.append(previousState.messages, message)
    }));
  }


  onSend([message]) {
    let msg = {
      text: message.text,
      roomId: this.room_id
    };

    if (this.attachment) {
      const filename = this.attachment.name;
      const type = this.attachment.file_type;

      msg.attachment = {
        file: {
          uri: this.attachment.uri,
          type: type,
          name: `${filename}`
        },
        name: `${filename}`,
        type: this.attachment.type
      };
    }

    this.setState({
      is_sending: true
    });

    this.currentUser.sendMessage(msg).then(() => {
      this.attachment = null;

      this.setState({
        is_sending: false
      });
    });
  }


  renderSend = props => {
    if (this.state.is_sending) {
      return (
        <ActivityIndicator
          size="small"
          color="#0064e1"
          style={[styles.loader, styles.sendLoader]}
        />
      );
    }

    return <Send {...props} />;
  }


  getMessage = async ({ id, senderId, text, attachment, createdAt }) => {

    let msg_data = {
      _id: id,
      text: text,
      createdAt: new Date(createdAt),
      user: {
        _id: senderId,
        name: senderId,
        avatar: "https://png.pngtree.com/svg/20170602/0db185fb9c.png"
      },
      attachment
    };

    if (attachment && attachment.type === 'video') {
      Object.assign(msg_data, { video: attachment.link });
    }

    return {
      message: msg_data
    };
  }


  renderMessage = (msg) => {

    const { attachment } = msg.currentMessage;
    const renderBubble = (attachment && attachment.type === 'audio') ? this.renderPreview.bind(this, attachment.link) : null;
    const onLongPress = (attachment  && attachment.type === 'video') ? this.onLongPressMessageBubble.bind(this, attachment.link) : null;

    const modified_msg = {
      ...msg,
      renderBubble,
      onLongPress,
      videoProps: {
        paused: true
      }
    }

    return <Message {...modified_msg} />
  }

  //

  onLongPressMessageBubble = (link) => {
    this.setState({
      is_modal_visible: true,
      video_uri: link
    });
  }


  renderPreview = (uri, bubbleProps) => {
    const text_color = (bubbleProps.position == 'right') ? '#FFF' : '#000';
    const modified_bubbleProps = {
      ...bubbleProps
    };

    return (
      <ChatBubble {...modified_bubbleProps}>
        <AudioPlayer url={uri} />
      </ChatBubble>
    );
  }

  //


  render() {
    const { is_initialized, messages, video_uri } = this.state;

    return (
      <View style={styles.container}>
        {(!is_initialized) && (
          <ActivityIndicator
            size="small"
            color="#0064e1"
            style={styles.loader}
          />
        )}

        {is_initialized && (
          <GiftedChat
            messages={messages}
            onSend={messages => this.onSend(messages)}
            user={{
              _id: this.user_id
            }}
            renderActions={this.renderCustomActions}
            renderSend={this.renderSend}
            renderMessage={this.renderMessage}
          />
        )}

        <Modal isVisible={this.state.is_modal_visible}>
          <View style={styles.modal}>
            <TouchableOpacity onPress={this.hideModal}>
              <Icon name={"close"} size={20} color={"#FFF"} style={styles.close} />
            </TouchableOpacity>
            <VideoPlayer uri={video_uri} />
          </View>
        </Modal>

      </View>
    );
  }

  //

  hideModal = () => {
    this.setState({
      is_modal_visible: false,
      video_uri: null
    });
  }

  //

  renderCustomActions = () => {
    if (!this.state.is_picking_file) {
      const icon_color = this.attachment ? "#0064e1" : "#808080";

      return (
        <View style={styles.customActionsContainer}>
          <TouchableOpacity onPress={this.openFilePicker}>
            <View style={styles.buttonContainer}>
              <Icon name="paperclip" size={23} color={icon_color} />
            </View>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ActivityIndicator size="small" color="#0064e1" style={styles.loader} />
    );
  }

  //

  openFilePicker = async () => {
    await this.setState({
      is_picking_file: true
    });

    console.log('mp3: ', mime.lookup('mp3'));
    console.log('mp4: ', mime.lookup('mp4'));

    DocumentPicker.show({
      filetype: [mime.lookup('mp3'), mime.lookup('mp4')],
    }, (err, file) => {

      if (!err) {
        this.attachment = {
          name: file.fileName,
          uri: file.uri,
          type: "file",
          file_type: mime.contentType(file.fileName)
        };

        Alert.alert("Success", "File attached!");
      }

      this.setState({
        is_picking_file: false
      });
    });
  }

}


const styles = {
  container: {
    flex: 1
  },
  loader: {
    paddingTop: 20
  },
  sendLoader: {
    marginRight: 10,
    marginBottom: 10
  },
  customActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  buttonContainer: {
    padding: 10
  },
  modal: {
    flex: 1
  },
  close: {
    alignSelf: 'flex-end',
    marginBottom: 10
  }
}

export default Chat;